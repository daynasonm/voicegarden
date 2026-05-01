import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const scene = document.querySelector("#scene");
const video = document.querySelector("#webcam");
const voiceStatus = document.querySelector("#voiceStatus");
const headStatus = document.querySelector("#headStatus");
const imageStatus = document.querySelector("#imageStatus");
const soundStatus = document.querySelector("#soundStatus");
const nightButton = document.querySelector('[data-command="night"]');
const voiceButton = document.querySelector('[data-command="voice"]');
const echoBursts = [...document.querySelectorAll(".echo-burst")];

const audioApi = {
  // Replace with a real API response later. This direct CDN item behaves like
  // an API-delivered asset in the browser without requiring a secret key.
  endpoint: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=ambient-piano-logo-12475.mp3"
};

let audioContext;
let mainGain;
let filter;
let delay;
let source;
let environmentAudioContext;
let environmentLeftAnalyser;
let environmentRightAnalyser;
let environmentSource;
let environmentLeftData;
let environmentRightData;
let environmentChannelMode = "mono";
let burstIndex = 0;
let lastBurstAt = 0;
let handLandmarker;
let faceLandmarker;
let lastVideoTime = -1;
let smoothedLookX = 0.5;
let smoothedLookY = 0.5;
let recognition;
let listening = false;
let voiceArmed = false;
let activeSeason = "garden";
let revealTimers = [];
let imageLoadId = 0;

const setCssNumber = (name, value) => {
  document.documentElement.style.setProperty(name, Number(value).toFixed(4));
};

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothLook = (current, target, speed = 0.26) => current + (target - current) * speed;
const applyDeadZone = (value, center = 0.5, radius = 0.025) => {
  const offset = value - center;
  if (Math.abs(offset) <= radius) {
    return center;
  }
  return center + Math.sign(offset) * (Math.abs(offset) - radius);
};
const rms = (data, start = 0, end = data.length) => {
  let sum = 0;
  for (let index = start; index < end; index += 1) {
    const sample = (data[index] - 128) / 128;
    sum += sample * sample;
  }
  return Math.sqrt(sum / Math.max(1, end - start));
};

const seasonalSearchTerms = {
  garden: [
  "flower macro pistil stamen",
  "hibiscus flower macro stamen",
  "mallow flower macro",
  "flower close up translucent petals",
  "botanical microscope flower",
  "flower anatomy macro",
  "pollen stamen macro",
  "lily flower center macro",
  "orchid flower center close up",
  "morning glory flower macro",
  "white flower pistil macro",
  "petal veins macro",
  "botanical specimen flower close up",
  "macro photograph flower center"
  ],
  spring: [
    "spring blossom flower macro",
    "cherry blossom spring flower",
    "tulip garden spring",
    "daffodil flower spring",
    "crocus flower spring",
    "magnolia blossom spring",
    "hyacinth spring flower",
    "spring wildflowers meadow",
    "apple blossom macro",
    "fresh green leaves spring",
    "primrose spring flower",
    "botanical spring flowers"
  ],
  summer: [
    "summer wildflowers meadow",
    "sunflower summer garden",
    "hibiscus summer flower",
    "zinnia summer flower",
    "dahlia summer garden",
    "lavender field summer",
    "cosmos flower summer",
    "water lily summer pond",
    "rose garden summer",
    "poppy summer flower",
    "bright summer garden plants",
    "summer flower macro"
  ],
  fall: [
    "autumn flowers garden",
    "fall chrysanthemums flower",
    "aster flower autumn",
    "goldenrod autumn flower",
    "autumn leaves plant",
    "maple leaves fall color",
    "dahlia autumn flower",
    "marigold fall garden",
    "sedum autumn flower",
    "fall meadow plants",
    "orange autumn flower macro",
    "botanical autumn plants"
  ],
  winter: [
    "winter jasmine flower",
    "hellebore winter flower",
    "snowdrop flower winter",
    "camellia winter flower",
    "evergreen plant winter",
    "frosted leaves plant",
    "winter berries plant",
    "pine needles frost",
    "holly leaves berries winter",
    "witch hazel winter flower",
    "winter garden plants",
    "flower snow winter"
  ]
};

const seasonWords = Object.keys(seasonalSearchTerms).filter((season) => season !== "garden");

const extraTileCount = 30;

const imageTargets = [
  { selector: ".scene", variable: "--scene-image" },
  { selector: ".fountain-wide" },
  { selector: ".rose-bed" },
  { selector: ".glass-vase" },
  { selector: ".lilies" },
  { selector: ".fountain-slice" },
  { selector: ".orchid-stack" },
  { selector: ".meadow-band" },
  { selector: ".vase-tall" },
  { selector: ".water-column" },
  { selector: ".flower-close" },
  { selector: ".pond-mosaic" },
  { selector: ".botanical-window" },
  { selector: ".peony-ribbon" },
  { selector: ".garden-arch" }
];
const revealIntervalMs = 120;

const extraTileLayouts = [
  [3, 8, 22, 18, 0.2, 0.82, "center"],
  [27, 7, 16, 11, 0.52, 0.78, "45% 50%"],
  [63, 7, 20, 15, 0.74, 0.84, "center"],
  [82, 10, 16, 22, 1.08, 0.82, "60% 45%"],
  [8, 23, 20, 13, 0.34, 0.9, "center"],
  [35, 22, 18, 17, 0.62, 0.76, "55% 55%"],
  [56, 24, 17, 12, 0.84, 0.86, "center"],
  [75, 27, 23, 16, 1.22, 0.9, "50% 42%"],
  [-4, 38, 18, 19, 0.46, 0.72, "center"],
  [18, 39, 24, 11, 0.68, 0.78, "center"],
  [47, 40, 21, 15, 0.96, 0.8, "50% 60%"],
  [70, 43, 18, 12, 1.3, 0.82, "center"],
  [90, 41, 16, 19, 1.46, 0.72, "center"],
  [2, 55, 19, 12, 0.58, 0.84, "center"],
  [24, 54, 22, 19, 0.82, 0.8, "55% 40%"],
  [50, 56, 24, 13, 1.08, 0.82, "center"],
  [78, 56, 20, 18, 1.36, 0.78, "center"],
  [10, 70, 15, 22, 0.72, 0.76, "center"],
  [31, 69, 19, 16, 0.94, 0.82, "50% 45%"],
  [56, 71, 17, 21, 1.18, 0.78, "center"],
  [75, 72, 25, 15, 1.42, 0.86, "center"],
  [-3, 83, 23, 16, 0.66, 0.72, "center"],
  [20, 84, 18, 14, 0.9, 0.8, "center"],
  [41, 86, 25, 13, 1.14, 0.82, "50% 65%"],
  [67, 87, 16, 14, 1.32, 0.78, "center"],
  [84, 84, 20, 18, 1.5, 0.82, "center"],
  [14, 13, 10, 36, 1.18, 0.72, "center"],
  [42, 12, 9, 30, 1.34, 0.7, "center"],
  [68, 13, 11, 34, 1.5, 0.72, "center"],
  [94, 15, 9, 32, 1.62, 0.66, "center"]
];

const createExtraImageTiles = () => {
  const anchor = document.querySelector(".bio-hud");
  const fragment = document.createDocumentFragment();

  extraTileLayouts.slice(0, extraTileCount).forEach((layout, index) => {
    const [x, y, width, height, depth, opacity, position] = layout;
    const tile = document.createElement("div");
    tile.className = "tile dynamic-tile layer";
    tile.dataset.depth = String(depth);
    tile.style.setProperty("--depth", String(depth));
    tile.style.setProperty("--tile-x", `${x}vw`);
    tile.style.setProperty("--tile-y", `${y}vh`);
    tile.style.setProperty("--tile-w", `${width}vw`);
    tile.style.setProperty("--tile-h", `${height}vh`);
    tile.style.setProperty("--tile-opacity", String(opacity));
    tile.style.setProperty("--tile-position", index % 3 === 0 ? "50% 50%" : position);
    if (index % 4 === 0) {
      tile.classList.add("specimen-disc");
    } else if (index % 4 === 1) {
      tile.classList.add("specimen-soft");
    }
    tile.style.setProperty("--tile-delay", `${(index % 9) * -0.23}s`);
    tile.style.setProperty("--flicker-speed", `${2.1 + (index % 7) * 0.34}s`);
    tile.style.setProperty("--bob-speed", `${4.8 + (index % 6) * 0.55}s`);
    tile.style.setProperty("--bob-x", `${((index % 5) - 2) * 2}px`);
    tile.style.setProperty("--bob-y", `${(((index + 2) % 5) - 2) * 2}px`);
    tile.style.setProperty("--micro-x", `${((index % 4) - 1.5) * 5}px`);
    tile.style.setProperty("--micro-y", `${(((index + 1) % 4) - 1.5) * 5}px`);
    tile.setAttribute("aria-hidden", "true");
    imageTargets.push({ element: tile });
    fragment.append(tile);

    if (index % 5 === 0) {
      tile.style.mixBlendMode = "normal";
    }
  });

  scene.insertBefore(fragment, anchor);
};

createExtraImageTiles();

document.querySelectorAll("[data-depth]").forEach((layer) => {
  layer.style.setProperty("--depth", layer.dataset.depth);
});

const getImageElements = () =>
  imageTargets
    .map((target) => target.element || document.querySelector(target.selector))
    .filter(Boolean);

const startImageReveal = () => {
  revealTimers.forEach((timer) => window.clearTimeout(timer));
  revealTimers = [];

  const elements = getImageElements();
  elements.forEach((element, index) => {
    element.style.setProperty("--tile-visible", index === 0 ? "1" : "0");
  });
  imageStatus.textContent = `1/${elements.length}`;

  elements.slice(1).forEach((element, index) => {
    const timer = window.setTimeout(() => {
      element.style.setProperty("--tile-visible", "1");
      imageStatus.textContent = `${index + 2}/${elements.length}`;
      setCssNumber("--overdrive", Math.min(1, (index + 2) / elements.length));
      pulseGarden(0.35 + Math.min(0.65, (index + 2) / elements.length));
    }, (index + 1) * revealIntervalMs);
    revealTimers.push(timer);
  });
};

const getCommonsImages = async (term) => {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "12",
    gsrsearch: `${term} filetype:bitmap`,
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "1800"
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!response.ok) {
    throw new Error("Commons image search failed");
  }

  const data = await response.json();
  const pages = Object.values(data.query?.pages ?? {});

  return pages
    .map((page) => {
      const info = page.imageinfo?.[0];
      const title = page.title?.replace(/^File:/, "") ?? term;
      return {
        url: info?.thumburl || info?.url,
        mime: info?.mime,
        title
      };
    })
    .filter((image) => image.url && /^image\/(jpeg|png|webp)$/i.test(image.mime ?? ""));
};

const loadGardenImages = async (season = activeSeason) => {
  const terms = seasonalSearchTerms[season] || seasonalSearchTerms.garden;
  const loadId = imageLoadId + 1;
  imageLoadId = loadId;
  activeSeason = season;
  imageStatus.textContent = season === "garden" ? "loading" : season;

  try {
    const groups = await Promise.all(terms.map(getCommonsImages));
    if (loadId !== imageLoadId) {
      return;
    }

    const images = groups.flat();
    const seen = new Set();
    const uniqueImages = images.filter((image) => {
      if (seen.has(image.url)) {
        return false;
      }
      seen.add(image.url);
      return true;
    });

    if (!uniqueImages.length) {
      throw new Error("No Commons garden images found");
    }

    imageTargets.forEach((target, index) => {
      const element = target.element || document.querySelector(target.selector);
      const image = uniqueImages[index % uniqueImages.length];
      if (!element || !image) {
        return;
      }

      const cssImage = `url("${image.url}")`;
      if (target.variable) {
        element.style.setProperty(target.variable, cssImage);
      } else {
        element.style.backgroundImage = cssImage;
      }
      element.title = `Wikimedia Commons: ${image.title}`;
    });

    imageStatus.textContent = season === "garden"
      ? `${Math.min(uniqueImages.length, imageTargets.length)} commons`
      : season;
    startImageReveal();
  } catch {
    if (loadId !== imageLoadId) {
      return;
    }

    imageStatus.textContent = season === "garden" ? "fallback" : `${season} fallback`;
    startImageReveal();
  }
};

const setGardenLook = (x, y = 0.5) => {
  const nx = clamp(x);
  const ny = clamp(y);
  setCssNumber("--look-x", nx);
  setCssNumber("--look-y", ny);
  document.documentElement.style.setProperty("--scene-pan-x", `${30 + nx * 40}%`);
  document.documentElement.style.setProperty("--scene-pan-y", `${24 + ny * 52}%`);
};

const setHandControl = (x, y) => {
  const nx = clamp(x);
  const ny = clamp(y);
  setCssNumber("--hand-x", nx);
  setCssNumber("--hand-y", ny);

  if (audioContext && filter && mainGain) {
    filter.frequency.setTargetAtTime(420 + nx * 4200, audioContext.currentTime, 0.05);
    mainGain.gain.setTargetAtTime(0.04 + (1 - ny) * 0.42, audioContext.currentTime, 0.05);
    setCssNumber("--echo-energy", 0.22 + (1 - ny) * 0.72);
    soundStatus.textContent = `tone ${Math.round(420 + nx * 4200)}hz`;
  }
};

const triggerEnvironmentEcho = (side, energy) => {
  if (!echoBursts.length) {
    return;
  }

  const burst = echoBursts[burstIndex % echoBursts.length];
  burstIndex += 1;

  const sideBase = side === "left" ? 18 : side === "right" ? 82 : 50;
  const spread = side === "center" ? 34 : 18;
  const x = clamp((sideBase + (Math.random() - 0.5) * spread) / 100, 0.05, 0.95) * 100;
  const y = (18 + Math.random() * 64);

  burst.classList.remove("active");
  burst.style.setProperty("--burst-x", x.toFixed(2));
  burst.style.setProperty("--burst-y", y.toFixed(2));
  burst.style.setProperty("--burst-speed", `${0.9 + Math.random() * 0.55}s`);
  burst.offsetWidth;
  burst.classList.add("active");

  setCssNumber("--sound-x", x / 100);
  setCssNumber("--sound-y", y / 100);
  setCssNumber("--echo-energy", clamp(energy * 12, 0.28, 1));
};

const setupEnvironmentAudio = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: { ideal: 2 },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    await startEnvironmentAudio(stream);
  } catch {
    soundStatus.textContent = "mic off";
  }
};

const startEnvironmentAudio = async (stream) => {
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) {
    soundStatus.textContent = "mic off";
    return;
  }

  environmentAudioContext = environmentAudioContext || new AudioContext();
  if (environmentAudioContext.state === "suspended") {
    environmentAudioContext.resume().catch(() => {});
  }

  environmentLeftAnalyser = environmentAudioContext.createAnalyser();
  environmentRightAnalyser = environmentAudioContext.createAnalyser();
  environmentLeftAnalyser.fftSize = 1024;
  environmentRightAnalyser.fftSize = 1024;
  environmentLeftAnalyser.smoothingTimeConstant = 0.62;
  environmentRightAnalyser.smoothingTimeConstant = 0.62;
  environmentLeftData = new Uint8Array(environmentLeftAnalyser.fftSize);
  environmentRightData = new Uint8Array(environmentRightAnalyser.fftSize);
  environmentSource = environmentAudioContext.createMediaStreamSource(stream);

  const settings = audioTracks[0].getSettings?.() || {};
  environmentChannelMode = settings.channelCount && settings.channelCount > 1 ? "stereo-ish" : "mono";
  if (environmentChannelMode === "stereo-ish") {
    const splitter = environmentAudioContext.createChannelSplitter(2);
    environmentSource.connect(splitter);
    splitter.connect(environmentLeftAnalyser, 0);
    splitter.connect(environmentRightAnalyser, 1);
  } else {
    environmentSource.connect(environmentLeftAnalyser);
    environmentSource.connect(environmentRightAnalyser);
  }

  soundStatus.textContent = environmentChannelMode === "mono" ? "env mono" : "env stereo";
  requestAnimationFrame(trackEnvironmentAudio);
};

const trackEnvironmentAudio = () => {
  if (!environmentLeftAnalyser || !environmentRightAnalyser || !environmentLeftData || !environmentRightData) {
    return;
  }

  environmentLeftAnalyser.getByteTimeDomainData(environmentLeftData);
  environmentRightAnalyser.getByteTimeDomainData(environmentRightData);
  const leftEnergy = rms(environmentLeftData);
  const rightEnergy = rms(environmentRightData);
  const totalEnergy = (leftEnergy + rightEnergy) / 2;

  const balance = environmentChannelMode === "mono"
    ? 0
    : clamp((rightEnergy - leftEnergy) * 8, -1, 1);
  const soundX = environmentChannelMode === "mono" ? 0.5 : 0.5 + balance * 0.38;

  setCssNumber("--ambient-left", clamp(leftEnergy * 16));
  setCssNumber("--ambient-right", clamp(rightEnergy * 16));
  setCssNumber("--sound-x", soundX);
  setCssNumber("--sound-y", 0.5);
  setCssNumber("--echo-energy", clamp(totalEnergy * 10, 0.08, 1));

  const now = performance.now();
  if (totalEnergy > 0.012 && now - lastBurstAt > 85) {
    lastBurstAt = now;
    const side = balance < -0.12 ? "left" : balance > 0.12 ? "right" : "center";
    triggerEnvironmentEcho(side, totalEnergy);
  }

  requestAnimationFrame(trackEnvironmentAudio);
};

const pulseGarden = (energy = 1) => {
  setCssNumber("--voice-energy", clamp(energy));
  setCssNumber("--echo-energy", clamp(energy));
  window.setTimeout(() => setCssNumber("--voice-energy", 0.2), 650);
  window.setTimeout(() => setCssNumber("--echo-energy", audioContext ? 0.32 : 0.08), 900);
};

const setNightMode = (enabled) => {
  scene.classList.toggle("night", enabled);
  if (nightButton) {
    nightButton.textContent = enabled ? "Day" : "Night";
    nightButton.dataset.command = enabled ? "day" : "night";
  }
};

const createFallbackPad = () => {
  const oscillatorA = audioContext.createOscillator();
  const oscillatorB = audioContext.createOscillator();
  const padGain = audioContext.createGain();

  oscillatorA.type = "sine";
  oscillatorB.type = "triangle";
  oscillatorA.frequency.value = 220;
  oscillatorB.frequency.value = 329.63;
  padGain.gain.value = 0.05;

  oscillatorA.connect(padGain);
  oscillatorB.connect(padGain);
  padGain.connect(filter);
  oscillatorA.start();
  oscillatorB.start();
};

const startSound = async () => {
  if (!audioContext) {
    audioContext = new AudioContext();
    mainGain = audioContext.createGain();
    filter = audioContext.createBiquadFilter();
    delay = audioContext.createDelay(4);
    const feedback = audioContext.createGain();

    filter.type = "lowpass";
    filter.frequency.value = 1800;
    delay.delayTime.value = 0.42;
    feedback.gain.value = 0.34;
    mainGain.gain.value = 0.18;

    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(mainGain);
    filter.connect(mainGain);
    mainGain.connect(audioContext.destination);

    try {
      const response = await fetch(audioApi.endpoint);
      const buffer = await response.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(buffer);
      source = audioContext.createBufferSource();
      source.buffer = decoded;
      source.loop = true;
      source.playbackRate.value = 0.72;
      source.connect(filter);
      source.start();
      soundStatus.textContent = "api audio";
    } catch {
      createFallbackPad();
      soundStatus.textContent = "synth pad";
    }
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
};

const applyCommand = async (command) => {
  const text = command.toLowerCase();
  voiceStatus.textContent = text;

  const season = seasonWords.find((word) => text.includes(word));
  if (season && season !== activeSeason) {
    await loadGardenImages(season);
    pulseGarden(1);
  }

  if (text.includes("play") || text.includes("sound")) {
    await startSound();
    pulseGarden(0.65);
  }

  if (text.includes("bloom") || text.includes("flower")) {
    pulseGarden(1);
  }

  if (text.includes("night") || text.includes("moon")) {
    setNightMode(true);
    pulseGarden(0.42);
  }

  if (text.includes("day") || text.includes("sun")) {
    setNightMode(false);
    pulseGarden(0.74);
  }
};

const setupVoice = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceStatus.textContent = "unsupported";
    if (voiceButton) {
      voiceButton.textContent = "No voice";
      voiceButton.disabled = true;
    }
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  voiceStatus.textContent = "tap to speak";
  if (voiceButton) {
    voiceButton.textContent = "Speak";
  }

  recognition.onstart = () => {
    listening = true;
    voiceStatus.textContent = "listening";
    if (voiceButton) {
      voiceButton.textContent = "Stop";
    }
  };

  recognition.onend = () => {
    listening = false;
    voiceArmed = false;
    voiceStatus.textContent = "tap to speak";
    if (voiceButton) {
      voiceButton.textContent = "Speak";
    }
  };

  recognition.onerror = (event) => {
    listening = false;
    voiceArmed = false;
    voiceStatus.textContent = event.error === "not-allowed" ? "mic blocked" : event.error;
    if (voiceButton) {
      voiceButton.textContent = "Speak";
    }
  };

  recognition.onresult = (event) => {
    const latest = Array.from(event.results)
      .slice(event.resultIndex)
      .map((result) => result[0].transcript)
      .join(" ");

    if (latest.trim()) {
      applyCommand(latest);
    }
  };
};

const startVoiceListening = () => {
  if (listening) {
    return;
  }

  if (!recognition) {
    voiceStatus.textContent = "unsupported";
    return;
  }

  voiceArmed = true;
  voiceStatus.textContent = "starting";
  if (voiceButton) {
    voiceButton.textContent = "Stop";
  }

  try {
    recognition.start();
  } catch (error) {
    voiceArmed = false;
    if (voiceButton) {
      voiceButton.textContent = "Speak";
    }
    voiceStatus.textContent = "tap again";
  }
};

const stopVoiceListening = () => {
  if (!recognition || !listening) {
    return;
  }

  voiceArmed = false;
  recognition.stop();
  voiceStatus.textContent = "processing";
  if (voiceButton) {
    voiceButton.textContent = "Speak";
  }
};

const toggleVoiceListening = () => {
  if (listening) {
    stopVoiceListening();
  } else {
    startVoiceListening();
  }
};

if (voiceButton) {
  voiceButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleVoiceListening();
  });
}

const setupMediaPipe = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    await video.play();

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 1
    });

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1
    });

    headStatus.textContent = "tracking";
    requestAnimationFrame(trackMediaPipe);
  } catch {
    headStatus.textContent = "camera off";
  }
};

const trackMediaPipe = () => {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();
    const faceResult = faceLandmarker?.detectForVideo(video, now);
    const face = faceResult?.faceLandmarks?.[0];

    if (face) {
      const nose = face[1];
      const leftEyeOuter = face[33];
      const rightEyeOuter = face[263];
      const chin = face[152];
      const forehead = face[10];
      const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
      const eyeMidY = (leftEyeOuter.y + rightEyeOuter.y) / 2;
      const eyeSpan = Math.max(0.08, Math.abs(rightEyeOuter.x - leftEyeOuter.x));
      const faceHeight = Math.max(0.18, Math.abs(chin.y - forehead.y));
      const yaw = (nose.x - eyeMidX) / eyeSpan;
      const pitch = (nose.y - eyeMidY) / faceHeight;
      const faceCenterX = (leftEyeOuter.x + rightEyeOuter.x + nose.x) / 3;
      const faceCenterY = (forehead.y + chin.y + nose.y) / 3;
      const headX = applyDeadZone(1 - faceCenterX);
      const headY = applyDeadZone(faceCenterY);
      const lookX = clamp(0.5 + (headX - 0.5) * 1.85 - yaw * 0.72);
      const lookY = clamp(0.5 + (headY - 0.5) * 1.55 + pitch * 0.46);

      smoothedLookX = smoothLook(smoothedLookX, lookX, 0.28);
      smoothedLookY = smoothLook(smoothedLookY, lookY, 0.24);
      setGardenLook(smoothedLookX, smoothedLookY);

      if (smoothedLookY < 0.34) {
        headStatus.textContent = smoothedLookX > 0.57 ? "up right" : smoothedLookX < 0.43 ? "up left" : "up";
      } else if (smoothedLookY > 0.66) {
        headStatus.textContent = smoothedLookX > 0.57 ? "down right" : smoothedLookX < 0.43 ? "down left" : "down";
      } else if (smoothedLookX > 0.57) {
        headStatus.textContent = "right";
      } else if (smoothedLookX < 0.43) {
        headStatus.textContent = "left";
      } else {
        headStatus.textContent = "center";
      }
    }

    const handResult = handLandmarker?.detectForVideo(video, now);
    const hand = handResult?.landmarks?.[0];

    if (hand) {
      const indexTip = hand[8];
      setHandControl(1 - indexTip.x, indexTip.y);
    }
  }

  requestAnimationFrame(trackMediaPipe);
};

window.addEventListener("pointermove", (event) => {
  setHandControl(event.clientX / window.innerWidth, event.clientY / window.innerHeight);
});

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", async () => {
    const command = button.dataset.command;
    if (command === "voice") {
      return;
    }
    if (environmentAudioContext?.state === "suspended") {
      await environmentAudioContext.resume();
    }
    await applyCommand(command);
  });
});

setupVoice();
setupMediaPipe();
setupEnvironmentAudio();
loadGardenImages();
setGardenLook(0.5, 0.5);
setHandControl(0.5, 0.5);
window.setInterval(() => pulseGarden(1), 30000);
