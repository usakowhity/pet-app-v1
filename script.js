// ================================
//  pet-app-v1 script.js 改良版3
//  ・笑顔検出強化（smile + jawOpen）
//  ・音声認識強化（部分一致・途中結果）
//  ・名前呼びでペット切替 + 喜び
//  ・褒め言葉で喜び
//  ・クールダウン短縮で反応高速化
// ================================

import { FilesetResolver, FaceLandmarker } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs";

// --- DOM要素 ---
const petSelect   = document.getElementById("pet-select");
const imgElem     = document.getElementById("pet-image");
const vidElem     = document.getElementById("pet-video");
const msgElem     = document.getElementById("message");
const webcam      = document.getElementById("webcam");
const petSound    = document.getElementById("pet-sound");
const petContainer= document.getElementById("pet-container");

// --- ペットデータ ---
const PET_DATA = {
  usako: {
    n1: "assets/usako/n1.png",
    p2: "assets/usako/p2.mp4",
    sound: "assets/sounds/rabbit.mp3"
  },
  kuro: {
    n1: "assets/kuro/n1.png",
    p2: "assets/kuro/p2.mp4",   // 実ファイル名に合わせて変更可
    sound: "assets/sounds/rabbit.mp3"
  },
  taro: {
    n1: "assets/taro/n1.png",
    p2: "assets/taro/p2.mp4",
    sound: "assets/sounds/dog.mp3"
  }
};

let currentPet     = "usako";
let currentState   = "n1";
let faceLandmarker = null;
let lastVideoTime  = -1;
let lastJoyTime    = 0;
const JOY_COOLDOWN_MS = 800; // 反応を速くするため短め

// ================================
// 初期化
// ================================
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

// ================================
// 状態表示
// ================================
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

// 喜び状態（p2）へ
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

// ================================
// ペット選択（セレクトボックス）
// ================================
petSelect.addEventListener("change", () => {
  currentPet = petSelect.value;
  console.log("[PET] changed to", currentPet);
  loadN1();
});

// ================================
// 撫でる検知
// ================================
function setupTouchEvents() {
  console.log("[INIT] setupTouchEvents");
  const handle = () => triggerP2("touch");
  petContainer.addEventListener("touchmove", handle, { passive: true });
  petContainer.addEventListener("mousemove", (e) => {
    if (e.buttons === 1) handle();
  });
}

// ================================
// 音声認識（Web Speech API）
// ================================
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

    const clean = normalize(text);

    // 名前呼び → ペット切替 + 喜び
    if (detectPetName(clean)) return;

    // 褒め言葉 → 喜び
    if (detectPraise(clean)) return;

    // 途中結果でも反応させたい場合（より鋭く）
    if (!result.isFinal) {
      if (detectPetName(clean)) return;
      if (detectPraise(clean)) return;
    }
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

// 正規化（簡易）
function normalize(text) {
  return text
    .replace(/\s/g, "")
    .replace(/[。、]/g, "")
    .toLowerCase();
}

// 名前呼び検出（Python版ロジック移植）
function detectPetName(text) {
  const t = text.toLowerCase();

  // Usako
  if (
    text.includes("うさ") || text.includes("さこ") ||
    text.includes("ウサ") || text.includes("うさちゃん") ||
    text.includes("うーちゃん") ||
    t.includes("usako") || t.includes("usa") || t.includes("usaco")
  ) {
    console.log("[Logic] 名前呼び: usako");
    currentPet = "usako";
    petSelect.value = "usako";
    loadN1();
    triggerP2("name-usako");
    return true;
  }

  // Kuro
  if (
    text.includes("くろ") || text.includes("クロ") ||
    text.includes("くー") || t.includes("kuro")
  ) {
    console.log("[Logic] 名前呼び: kuro");
    currentPet = "kuro";
    petSelect.value = "kuro";
    loadN1();
    triggerP2("name-kuro");
    return true;
  }

  // Taro
  if (
    text.includes("たろ") || text.includes("タロ") ||
    text.includes("たー") || t.includes("taro")
  ) {
    console.log("[Logic] 名前呼び: taro");
    currentPet = "taro";
    petSelect.value = "taro";
    loadN1();
    triggerP2("name-taro");
    return true;
  }

  return false;
}

// 褒め言葉検出（Python版ロジック移植）
function detectPraise(text) {
  if (
    text.includes("かわいい") || text.includes("可愛い") ||
    text.includes("おりこう") || text.includes("お利口") ||
    text.includes("よし") ||
    text.includes("いいこ") || text.includes("いい子") ||
    text.includes("すごいね") || text.includes("えらいね")
  ) {
    console.log("[Logic] 褒め言葉検出 → p2");
    triggerP2("praise");
    return true;
  }
  return false;
}

// ================================
// MediaPipe Vision（笑顔検出）
// ================================
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

// 笑顔検出（smile + jawOpen の複合判定）
function detectSmile(shapes) {
  const left  = shapes.find(s => s.categoryName === "mouthSmileLeft")?.score  || 0;
  const right = shapes.find(s => s.categoryName === "mouthSmileRight")?.score || 0;
  const jaw   = shapes.find(s => s.categoryName === "jawOpen")?.score         || 0;

  const smile = (left + right) / 2;

  // console.log("[SMILE] smile:", smile.toFixed(3), "jaw:", jaw.toFixed(3));

  if (smile > 0.22 || jaw > 0.35) {
    console.log("[SMILE] trigger, smile:", smile, "jaw:", jaw);
    triggerP2("smile");
  }
}