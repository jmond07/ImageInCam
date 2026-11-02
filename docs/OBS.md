# Using ImageInCam with OBS (Discord, Zoom, Teams...)

ImageInCam holds your real webcam. OBS captures the ImageInCam window and sends it out as a virtual camera, which you pick in your call app.

## 1. Get ImageInCam ready

1. Open ImageInCam and get to the live view.
2. Open the menu (M) and use **Fit window to 16:9**. Make the window as big as you like (at least about 1280 px wide for a sharp picture).
3. In the menu, turn **Mirror camera off**, so the people on the call see you the right way round.
4. Optional: turn **Show hands** off, and press **F** for Presentation mode to hide the interface.

## 2. Set up OBS

1. Install [OBS Studio](https://obsproject.com).
2. In **Sources**, click **+** and choose **Window Capture**.
3. Window: pick `[ImageInCam.exe]: ImageInCam`.
4. Capture Method: **Windows 10 (1903 and up)**. Uncheck **Capture Cursor**.
5. Crop the title strip at the top: right-click the source, **Transform**, **Edit Transform**, and set **Crop Top** to **32 x your Windows display scale**:

   | Windows scale | Crop Top |
   | --- | --- |
   | 100% | 32 |
   | 125% | 40 |
   | 150% | 48 |
   | 175% | 56 |
   | 200% | 64 |

   (You can find your scale in Windows Settings, System, Display.)
6. Right-click the source, **Transform**, **Fit to screen** (Ctrl+F).

## 3. Send it to your call

1. In OBS, click **Start Virtual Camera**.
2. In Discord, Zoom or Teams, choose **OBS Virtual Camera** as your camera.

## Tips and fixes

- **Don't add your webcam to OBS.** ImageInCam is already using it, and a camera can only be used by one app at a time.
- **Don't minimize ImageInCam.** Another window covering it is fine, but a minimized window can't be captured.
- **The call app shows a black picture:** start the Virtual Camera in OBS first, then open or restart the call app.
- **Black capture in OBS:** try another Capture Method in the source's properties.
- **The picture looks blurry:** make the ImageInCam window bigger before capturing.
- **Text in the background looks flipped:** turn Mirror camera off in the menu.
- **Camera in use error in ImageInCam:** close any other app that is using the webcam.