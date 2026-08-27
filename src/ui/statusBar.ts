import * as vscode from 'vscode';

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.name = 'DevPulse';
    this.item.command = 'devpulse.showDashboard';
    this.item.text = '$(watch) 0 m';
    this.item.tooltip = 'DevPulse: registro de tiempo por proyecto';
    this.item.show();
  }

  update(text: string, tooltipMarkdown: string): void {
    this.item.text = text;
    this.item.tooltip = new vscode.MarkdownString(tooltipMarkdown);
  }

  dispose(): void {
    this.item.dispose();
  }
}
