# ImageInCam

Put images on your webcam and move them with your hands. Pinch to drop a picture, drag it around, resize it with your other hand, point at it to delete it. Everything runs on your computer.

## Download

Get the latest installer from the [Releases page](https://github.com/jmond07/ImageInCam/releases/latest) (`ImageInCam-Setup-<version>.exe`).

Windows will say "Windows protected your PC" because the installer isn't code-signed. Click **More info**, then **Run anyway**. The code is all in this repository if you want to check it.

Requirements: Windows 11 (built and tested there; Windows 10 should work but is untested) and a webcam. A GPU helps, but the app falls back to the CPU.

## What it does

- **Real-time hand tracking** with Google MediaPipe.
- **Image library**: up to 9 images, resized to 600 px and saved for next time.
- **Gestures** to place, move, resize and delete images (see below).
- **Spawn zone**: hands outside the zone can't create images, so reaching for your keyboard doesn't drop anything. You can edit the zone with the mouse.
- **Undo and redo**, **hide all images** and bring them back in the same place.
- **Presentation mode** hides the whole interface, for streaming or sharing your screen.

## Gestures

| Gesture | What it does |
| --- | --- |
| Pinch (thumb + index) on empty space | Drops a copy of the selected image |
| Pinch on an image | Grabs it. Move your hand to drag it, open your fingers to let go |
| Free hand: touch thumb + middle finger and move up or down | Makes the image you're holding bigger or smaller (the mouse wheel works too) |
| Point at an image with your index finger, other fingers closed, hold about 1 second | Deletes that image |
| Both hands open and still for about 1.2 seconds | Clears all images |

## Keyboard

| Key | Action |
| --- | --- |
| 1 to 9 | Pick the image to drop |
| Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z | Undo, redo |
| C | Clear all images |
| H | Hide or show the images |
| P | Pause or resume hand tracking |
| Z | Edit the spawn zone (drag to move, drag the handles to resize, double-click to reset) |
| S | Show or hide the hand skeleton |
| L | Show or hide the debug panel |
| F | Presentation mode (F or Esc to leave) |
| M | Open or close the menu |

The menu also lets you choose 1 or 2 hands, flip the mirror, fit the window to 16:9, manage the image library and reset the settings.

## Using it in calls and streams

ImageInCam works with OBS Studio and its Virtual Camera, so you can use it in Discord, Zoom, Teams and others. Step by step: [docs/OBS.md](docs/OBS.md).

## Privacy

- Nothing is uploaded and nothing is recorded. The camera picture stays in memory while the app runs.
- The app doesn't need an internet connection. The only time it opens something online is when you click one of the links on the welcome screen, and that opens your browser.
- Your image library and settings are saved on your computer, in the app's data folder (`%APPDATA%\ImageInCam`). Remove an image from the menu, or delete that folder, to get rid of them.

## Known limitations

- Windows only, for now.
- Very fast movements can make the tracker lose your hand for a moment. Good, even lighting in front of you helps a lot.
- When one hand covers the other, the hidden one is usually lost.
- The installer isn't code-signed, hence the Windows warning.

## Build from source

You need [Node.js](https://nodejs.org) (LTS) and Git.

```
git clone https://github.com/jmond07/ImageInCam.git
cd ImageInCam
npm install
npm run assets   # copies MediaPipe and the fonts into src/
npm start        # run the app
npm run dist     # build the Windows installer into dist/
```

Project layout:

```
main.js, preload.js    Electron: window, security, closing, links
src/
  index.html, style.css, renderer.js   interface and main loop
  gestures/                            pinch, hand shape, motion, hand ids, clear, delete
  scene.js, interaction.js, history.js images on screen, grabbing, undo/redo
  stamps.js, zone.js, menu.js, settings.js, theme.js
scripts/copy-assets.js                 copies third-party files into src/
```

## Third-party software

- [Electron](https://www.electronjs.org) (MIT)
- [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (Apache 2.0)
- [IBM Plex Mono](https://github.com/IBM/plex) (SIL Open Font License 1.1)

## License

[MIT](LICENSE). Made by [@m0ndddd](https://www.instagram.com/m0ndddd/).
