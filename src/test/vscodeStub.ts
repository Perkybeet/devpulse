import * as pathMod from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any */

class Emitter<T> {
  private listeners: ((e: T) => void)[] = [];
  event = (listener: (e: T) => void): { dispose(): void } => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  };
  fire(e: T): void {
    for (const l of [...this.listeners]) {
      l(e);
    }
  }
}

export interface StubOptions {
  workspacePath: string;
  configOverrides?: Record<string, unknown>;
}

export function createVscodeStub(opts: StubOptions): any {
  const emitters = {
    windowState: new Emitter<any>(),
    selection: new Emitter<any>(),
    activeEditor: new Emitter<any>(),
    docChange: new Emitter<any>(),
    docSave: new Emitter<any>(),
    configChange: new Emitter<any>(),
  };
  const registeredCommands = new Map<string, (...args: any[]) => any>();
  const messages: string[] = [];
  const panels: any[] = [];
  let savePath: string | undefined;
  let warningResponse: string | undefined;
  let quickPickLabels: string[] | undefined; // undefined = seleccionar todo
  let openPath: string | undefined;

  const Uri = {
    file: (p: string) => ({ fsPath: p, scheme: 'file', path: p, toString: () => `file://${p}` }),
  };

  const wsFolder = { name: pathMod.basename(opts.workspacePath), uri: Uri.file(opts.workspacePath), index: 0 };

  const stub: any = {
    _emitters: emitters,
    _messages: messages,
    _panels: panels,
    _setSavePath: (p: string | undefined) => {
      savePath = p;
    },
    _setWarningResponse: (r: string | undefined) => {
      warningResponse = r;
    },
    _setQuickPickLabels: (labels: string[] | undefined) => {
      quickPickLabels = labels;
    },
    _setOpenPath: (p: string | undefined) => {
      openPath = p;
    },

    StatusBarAlignment: { Left: 1, Right: 2 },
    ProgressLocation: { Notification: 15 },
    ViewColumn: { One: 1 },
    Uri,
    MarkdownString: class {
      constructor(public value: string) {}
    },
    window: {
      state: { focused: true },
      activeTextEditor: undefined as any,
      onDidChangeWindowState: emitters.windowState.event,
      onDidChangeTextEditorSelection: emitters.selection.event,
      onDidChangeActiveTextEditor: emitters.activeEditor.event,
      createStatusBarItem: () => ({
        text: '',
        tooltip: '',
        name: '',
        command: '',
        show(): void {},
        hide(): void {},
        dispose(): void {},
      }),
      showInformationMessage: async (msg: string) => {
        messages.push(msg);
        return undefined;
      },
      showErrorMessage: async (msg: string) => {
        messages.push(msg);
        return undefined;
      },
      showWarningMessage: async (_msg: string, _opts: any, ...items: string[]) =>
        warningResponse !== undefined && items.includes(warningResponse) ? warningResponse : undefined,
      showSaveDialog: async () => (savePath ? Uri.file(savePath) : undefined),
      showOpenDialog: async () => (openPath ? [Uri.file(openPath)] : undefined),
      showQuickPick: async (items: any[]) =>
        quickPickLabels === undefined ? items : items.filter((i) => quickPickLabels!.includes(i.label)),
      withProgress: (_o: any, task: (p: any) => Promise<unknown>) => task({ report(): void {} }),
      createWebviewPanel: () => {
        const panel = {
          webview: { html: '', onDidReceiveMessage: new Emitter<any>().event, cspSource: 'stub' },
          onDidDispose: new Emitter<any>().event,
          reveal(): void {},
          dispose(): void {},
        };
        panels.push(panel);
        return panel;
      },
    },
    workspace: {
      workspaceFolders: [wsFolder],
      onDidChangeTextDocument: emitters.docChange.event,
      onDidSaveTextDocument: emitters.docSave.event,
      onDidChangeConfiguration: emitters.configChange.event,
      getWorkspaceFolder: (uri: any) =>
        String(uri.fsPath).startsWith(opts.workspacePath) ? wsFolder : undefined,
      asRelativePath: (uri: any) => pathMod.relative(opts.workspacePath, uri.fsPath),
      getConfiguration: () => ({
        get: (key: string, def: unknown) =>
          opts.configOverrides && key in opts.configOverrides ? opts.configOverrides[key] : def,
      }),
    },
    commands: {
      registerCommand: (id: string, fn: (...args: any[]) => any) => {
        registeredCommands.set(id, fn);
        return { dispose(): void {} };
      },
      executeCommand: async (id: string, ...args: any[]) => {
        const fn = registeredCommands.get(id);
        return fn ? fn(...args) : undefined;
      },
    },
    env: { openExternal: async () => true },
  };
  return stub;
}

export function makeContext(storagePath: string): any {
  return {
    subscriptions: [] as { dispose(): unknown }[],
    globalStorageUri: { fsPath: storagePath },
  };
}

/** Intercepta require('vscode') para que el bundle real funcione fuera del editor. */
export function installStub(stub: unknown): () => void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Module = require('module');
  const orig = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (request === 'vscode') {
      return stub;
    }
    return orig.call(this, request, ...rest);
  };
  return () => {
    Module._load = orig;
  };
}
