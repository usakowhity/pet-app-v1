// ================================
//  pet-app-v1  完全版 script.js
// ================================

// --- 1. MediaPipe Vision (FaceLandmarker) ---
import { FilesetResolver, FaceLandmarker } from 
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";

// --- 2. DOM要素 ---
const petSelect = document.getElementById("pet-select");
const imgElem = document.getElementById("pet-image");
const vidElem = document.getElementById("pet-video");
const msgElem = document.getElementById("message");
const webcam = document.getElementById("webcam");
const petSound = document.getElementById("pet-sound");
const petContainer = document.getElementById("pet-container");

// --- 3. ペットデータ（n1画像 & p2動画 & 鳴き声） ---
const PET_DATA = {
  usako: {
    n1: "assets/usako/n1.png",
    p2: "assets/usako/p2.mp4",
    sound: "assets/sounds/rabbit.mp3"
  },
  kuro: {
    n1: "assets/kuro/n1.png",
    p2: "assets/kuro/p2.mp4",
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

// --- 4. 初期化 ---
window.addEventListener("DOMContentLoaded", async () => {
  loadN1();
  await setupVision();
  await setupCamera();
  setupSmileDetectionLoop();
  setupSpeechRecognition();
  setupTouchEvents();
  msgElem.innerText = "こんにちは！";
});

// --- 5. N1画像を表示 ---
function loadN1() {
  const data = PET_DATA[currentPet];
  vidElem.classList.add("hidden");
  imgElem.classList.remove("hidden");
  imgElem.src = data.n1;
  currentState = "n1";
}

// --- 6. p2動画を再生（終了後 +3秒で n1 に戻る） ---
function triggerP2() {
  if (currentState === "p2") return;

  const data = PET_DATA[currentPet];

  // 鳴き声
  petSound.src = data.sound;
  petSound.currentTime = 0;
  petSound.play().catch(() => {});

  // 動画切替
  imgElem.classList.add("hidden");
  vidElem.classList.remove("hidden");
  vidElem.src = data.p2;
  vidElem.play().catch(() => {});
  currentState = "p2";
  msgElem.innerText = "喜んでいるよ！";

  // 動画終了後 +3秒で n1 に戻す
  vidElem.onended = () => {
    setTimeout(() => {
      loadN1();
      msgElem.innerText = "また遊んでね！";
    }, 3000);
  };
}

// --- 7. ペット選択 ---
petSelect.addEventListener("change", () => {
  currentPet = petSelect.value;
  loadN1();
});

// --- 8. 撫でる検知（touchmove / mouse drag） ---
function setupTouchEvents() {
  const handle = () => triggerP2();
  petContainer.addEventListener("touchmove", handle, { passive: true });
  petContainer.addEventListener("mousemove", (e) => {
    if (e.buttons === 1) handle();
  });
}

// --- 9. 音声認識（常時オン） ---
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const text = event.results[event.results.length - 1][0].transcript.trim();
    processSpeech(text);
  };

  recognition.onend = () => {
    try { recognition.start(); } catch (e) {}
  };

  try { recognition.start(); } catch (e) {}
}

// 固定ワード（名前含む）
const TRIGGER_WORDS = [
  "かわいい", "可愛い", "おりこう", "大好き", "よし", "おいで",
  "タロ", "たろ", "タロウ",
  "うさこ", "ウサコ",
  "クロ", "くろ"
];

function processSpeech(text) {
  const clean = text.replace(/\s/g, "");
  if (TRIGGER_WORDS.some(w => clean.includes(w))) {
    triggerP2();
  }
}

// --- 10. 笑顔検知（常時オン） ---
async function setupVision() {
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
}

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: 480, height: 360 }
  });
  webcam.srcObject = stream;
}

function setupSmileDetectionLoop() {
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

function detectSmile(shapes) {
  const smile =
    (shapes.find(s => s.categoryName === "mouthSmileLeft")?.score +
     shapes.find(s => s.categoryName === "mouthSmileRight")?.score) / 2;

  if (smile > 0.5) {
    triggerP2();
  }
}