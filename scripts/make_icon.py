#!/usr/bin/env python3
"""Generate the DevPulse VS Code extension icon."""

from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 256
SCALE = 4
BACKGROUND = "#10151F"
PULSE = "#34D2A0"


def scaled_points(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    return [(x * SCALE, y * SCALE) for x, y in points]


def main() -> None:
    canvas_size = SIZE * SCALE
    image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    margin = 12 * SCALE
    draw.rounded_rectangle(
        (margin, margin, canvas_size - margin, canvas_size - margin),
        radius=42 * SCALE,
        fill=BACKGROUND,
    )

    pulse_points = [
        (38, 130),
        (77, 130),
        (91, 111),
        (106, 151),
        (126, 76),
        (147, 139),
        (162, 119),
        (176, 130),
        (218, 130),
    ]
    draw.line(
        scaled_points(pulse_points),
        fill=PULSE,
        width=8 * SCALE,
        joint="curve",
    )

    image = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    output = Path(__file__).resolve().parent.parent / "media" / "icon.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG")


if __name__ == "__main__":
    main()
