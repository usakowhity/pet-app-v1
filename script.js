// ================================
//  pet-app-v1 改良版 script.js
// ================================

import { FilesetResolver, FaceLandmarker } from 
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";

// --- DOM要素 ---
const petSelect = document.getElementById("pet-select");
const imgElem = document.getElementById("pet-image");
const vidElem = document.getElementById("pet-video");
const msgElem = document.getElementById("message");
const webcam = document.getElementById("webcam");
const petSound = document.getElementById("pet-sound");
const petContainer = document.getElementById("pet-container");

// --- ペットデータ ---
const PET_DATA = {
  usako: {
    n1: "assets/usako/n1.png",
    p2: "assets/usako/p2.mp4",
    sound: "assets/sounds/rabbit.mp3"
  },
  kuro: {
    n1: "assets/kuro/n1.png",
    p2: "assets/kuro/p2.mp4",   // ここは実ファイル名と完全一致させてね
    sound: "assets/sounds/rabbit.mp3"
  },
  taro: {
    n1: "assets/taro/n1.png",
    p2: "assets/taro/p2.mp4",
    sound: "assets/sounds/dog.mp3"
  }
};

let currentPet = "usako";
let currentState = "n1";
let faceLandmarker = null;
let lastVideoTime = -1;
let lastJoyTime = 0;          // 連続発火防止用
const JOY_COOLDOWN_MS = 2000; // 2秒クールダウン

// --- 初期化 ---
window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] DOMContentLoaded");
  loadN1();
  await setupVision();
  await setupCamera();
  setupSmileDetectionLoop();
  setupSpeechRecognition();
  setupTouchEvents();
  msgElem.innerText = "こんにちは！";
});

// --- N1画像表示 ---
function loadN1() {
  const data = PET_DATA[currentPet];
  console.log("[STATE] loadN1 for", currentPet, data?.n1);

  vidElem.classList.add("hidden");
  imgElem.classList.remove("hidden");

  imgElem.onerror = () => {
    console.error("[ERROR] N1 image not found:", data.n1);
    msgElem.innerText = "画像が見つかりません";
  };

  imgElem.src = data.n1;
  currentState = "n1";
}

// --- p2発火（動画終了後 +3秒で n1） ---
function triggerP2(source = "unknown") {
  const now = Date.now();
  if (currentState === "p2") {
    console.log("[SKIP] already in p2, source:", source);
    return;
  }
  if (now - lastJoyTime < JOY_COOLDOWN_MS) {
    console.log("[SKIP] cooldown, source:", source);
    return;
  }
  lastJoyTime = now;

  const data = PET_DATA[currentPet];
  console.log("[JOY] triggerP2 from", source, "pet:", currentPet, data);

  // 鳴き声
  petSound.onerror = () => {
    console.error("[ERROR] sound not found:", data.sound);
  };
  petSound.src = data.sound;
  petSound.currentTime = 0;
  petSound.play().catch(err => {
    console.warn("[WARN] sound play failed:", err);
  });

  // 動画切替
  imgElem.classList.add("hidden");
  vidElem.classList.remove("hidden");

  vidElem.onerror = () => {
    console.error("[ERROR] p2 video not found:", data.p2);
    msgElem.innerText = "動画が見つかりません";
  };

  vidElem.src = data.p2;
  vidElem.play().catch(err => {
    console.warn("[WARN] video play failed:", err);
  });

  currentState = "p2";
  msgElem.innerText = "喜んでいるよ！";

  vidElem.onended = () => {
    console.log("[VIDEO] ended, will return to n1 in 3s");
    setTimeout(() => {
      loadN1();
      msgElem.innerText = "また遊んでね！";
    }, 3000);
  };
}

// --- ペット選択 ---
petSelect.addEventListener("change", () => {
  currentPet = petSelect.value;
  console.log("[PET] changed to", currentPet);
  loadN1();
});

// --- 撫でる検知 ---
function setupTouchEvents() {
  console.log("[INIT] setupTouchEvents");
  const handle = () => triggerP2("touch");
  petContainer.addEventListener("touchmove", handle, { passive: true });
  petContainer.addEventListener("mousemove", (e) => {
    if (e.buttons === 1) handle();
  });
}

// --- 音声認識（常時オン & interimResults true） ---
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("[WARN] SpeechRecognition not supported");
    return;
  }

  console.log("[INIT] setupSpeechRecognition");
  const recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const text = result[0].transcript.trim();
    console.log("[SR] result:", text, "final:", result.isFinal);
    processSpeech(text);
  };

  recognition.onerror = (e) => {
    console.error("[SR ERROR]", e.error);
  };

  recognition.onend = () => {
    console.log("[SR] restarted");
    try { recognition.start(); } catch (e) {}
  };

  try {
    recognition.start();
    console.log("[SR] started");
  } catch (e) {
    console.error("[SR ERROR] start failed:", e);
  }
}

// 固定ワード
const TRIGGER_WORDS = [
  "かわいい", "可愛い", "いい子", "大好き", "好き", "おいで",
  "タロ", "たろ", "タロウ",
  "うさこ", "ウサコ",
  "クロ", "くろ"
];

function processSpeech(text) {
  const clean = text.replace(/\s/g, "");
  console.log("[SR] processing:", clean);

  if (TRIGGER_WORDS.some(w => clean.includes(w))) {
    console.log("[SR] trigger word detected");
    triggerP2("speech");
  }
}

// --- MediaPipe Vision セットアップ ---
async function setupVision() {
  console.log("[INIT] setupVision");
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    runningMode: "VIDEO",
    numFaces: 1
  });

  console.log("[INIT] FaceLandmarker ready");
}

async function setupCamera() {
  console.log("[INIT] setupCamera");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 480, height: 360 }
    });
    webcam.srcObject = stream;
    console.log("[CAM] started");
  } catch (e) {
    console.error("[CAM ERROR]", e);
    msgElem.innerText = "カメラ許可が必要です";
  }
}

function setupSmileDetectionLoop() {
  console.log("[INIT] setupSmileDetectionLoop");
  function loop() {
    if (faceLandmarker && webcam.videoWidth > 0) {
      if (webcam.currentTime !== lastVideoTime) {
        lastVideoTime = webcam.currentTime;
        const result = faceLandmarker.detectForVideo(webcam, Date.now());

        if (result.faceBlendshapes?.length > 0) {
          detectSmile(result.faceBlendshapes[0].categories);
        }
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}

// --- 笑顔検知（閾値 0.30 に調整） ---
function detectSmile(shapes) {
  const left = shapes.find(s => s.categoryName === "mouthSmileLeft")?.score || 0;
  const right = shapes.find(s => s.categoryName === "mouthSmileRight")?.score || 0;
  const smile = (left + right) / 2;

  // デバッグ用ログ（必要ならコメントアウト）
  // console.log("[SMILE] score:", smile.toFixed(3));

  if (smile > 0.30) {
    console.log("[SMILE] trigger, score:", smile);
    triggerP2("smile");
  }
}