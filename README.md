This is a submission for [Telegram contest for JS Developers](https://t.me/contest/357). [Tasks description](https://contest.com/docs/JS-Contest-2024-r1). 

The application is available [online](https://entry5303-js2024r1.usercontent.dev).

## How tasks are implemented

### Part 1 (Live Streaming)

I used Media Source API for video and Web Audio API.
They are played separately and sync if one gets behind another,
that usually happens when browser stops video when tab becomes invisible.

Each loaded part of live stream handled with mp4box.
mp4box gets initialization and media segments for video.
Also, mp4box extracts all audio samples form the chunk.
Samples are decoded to PCM using opus-decoder.

Initialization segment of the first part is used when creating SourceBuffer.

Media segment is appended to SourceBuffer.
Decoded audio is appended to AudioBuffer connected to AudioContext.

Before starting playback, first 3 parts (3 seconds) are buffered.

### Part 2 (Chromium Issue Workaround)

Bug is related to reading AudioSpecificConfig.
ASC contains information about channel count.

I find ASC in each video/mp4 streamed from ServiceWorker.
If ASC is found and equal to 0x1388,
I replace it with 0x1398.

This sets channel count in ASC to 0b0011 that is 3.
It works also for 0b0010 that is 2, but only left channel is played. (The silence is played on right channel)

mp4a box still contains 1 channel count.

### Added Dependencies

- mp4box.js - https://github.com/gpac/mp4box.js
- opus-decoder - https://www.npmjs.com/package/opus-decoder

## Telegram Web K
Based on Webogram, patched and improved. Available for everyone here: https://web.telegram.org/k/


### Developing
Install dependencies with:
```lang=bash
pnpm install
```
This will install all the needed dependencies.


#### Running web-server
Just run `pnpm start` to start the web server and the livereload task.
Open http://localhost:8080/ in your browser.


#### Running in production

Run `node build` to build the minimized production version of the app. Copy `public` folder contents to your web server.


### Dependencies
* [BigInteger.js](https://github.com/peterolson/BigInteger.js) ([Unlicense](https://github.com/peterolson/BigInteger.js/blob/master/LICENSE))
* [pako](https://github.com/nodeca/pako) ([MIT License](https://github.com/nodeca/pako/blob/master/LICENSE))
* [cryptography](https://github.com/spalt08/cryptography) ([Apache License 2.0](https://github.com/spalt08/cryptography/blob/master/LICENSE))
* [emoji-data](https://github.com/iamcal/emoji-data) ([MIT License](https://github.com/iamcal/emoji-data/blob/master/LICENSE))
* [twemoji-parser](https://github.com/twitter/twemoji-parser) ([MIT License](https://github.com/twitter/twemoji-parser/blob/master/LICENSE.md))
* [rlottie](https://github.com/rlottie/rlottie.github.io) ([MIT License](https://github.com/Samsung/rlottie/blob/master/licenses/COPYING.MIT))
* [fast-png](https://github.com/image-js/fast-png) ([MIT License](https://github.com/image-js/fast-png/blob/master/LICENSE))
* [opus-recorder](https://github.com/chris-rudmin/opus-recorder) ([BSD License](https://github.com/chris-rudmin/opus-recorder/blob/master/LICENSE.md))
* [Prism](https://github.com/PrismJS/prism) ([MIT License](https://github.com/PrismJS/prism/blob/master/LICENSE))
* [Solid](https://github.com/solidjs/solid) ([MIT License](https://github.com/solidjs/solid/blob/main/LICENSE))
* [libwebp.js](https://libwebpjs.appspot.com/)
* fastBlur

### Debugging
You are welcome in helping to minimize the impact of bugs. There are classes, binded to global context. Look through the code for certain one and just get it by its name in developer tools.
Source maps are included in production build for your convenience.

#### Additional query parameters
* **test=1**: to use test DCs
* **debug=1**: to enable additional logging
* **noSharedWorker=1**: to disable Shared Worker, can be useful for debugging
* **http=1**: to force the use of HTTPS transport when connecting to Telegram servers

Should be applied like that: http://localhost:8080/?test=1


### Troubleshooting & Suggesting

If you find an issue with this app or wish something to be added, let Telegram know using the [Suggestions Platform](https://bugs.telegram.org/c/4002).

### Licensing

The source code is licensed under GPL v3. License is available [here](/LICENSE).
