// ================================
//  pet-app-v1 script.js 改良版4
//  FaceMesh方式で笑顔検出（鋭さ最優先）
// ================================

// --- 1. DOM要素 ---
const petSelect    = document.getElementById("pet-select");
const imgElem      = document.getElementById("pet-image");
const vidElem      = document.getElementById("pet-video");
const msgElem      = document.getElementById("message");
const webcam       = document.getElementById("webcam");
const petSound     = document.getElementById("pet-sound");
const petContainer = document.getElementById("pet-container");

// --- 2. ペットデータ ---
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

let currentPet   = "usako";
let currentState = "n1";
let lastJoyTime  = 0;
const JOY_COOLDOWN_MS = 800;

// ================================
// 初期化
// ================================
window.addEventListener("DOMContentLoaded", async () => {
  console.log("[INIT] DOMContentLoaded");
  loadN1();
  await setupCamera();
  await setupFaceMesh();
  setupSpeechRecognition();
  setupTouchEvents();
  msgElem.innerText = "こんにちは！";
});

// ================================
// N1表示
// ================================
function loadN1() {
  const data = PET_DATA[currentPet];
  vidElem.classList.add("hidden");
  imgElem.classList.remove("hidden");
  imgElem.src = data.n1;
  currentState = "n1";
}

// ================================
// p2（喜び）へ
// ================================
function triggerP2(source = "unknown") {
  const now = Date.now();
  if (currentState === "p2") return;
  if (now - lastJoyTime < JOY_COOLDOWN_MS) return;
  lastJoyTime = now;

  const data = PET_DATA[currentPet];

  // 鳴き声
  petSound.src = data.sound;
  petSound.currentTime = 0;
  petSound.play().catch(()=>{});

  // 動画
  imgElem.classList.add("hidden");
  vidElem.classList.remove("hidden");
  vidElem.src = data.p2;
  vidElem.play().catch(()=>{});

  currentState = "p2";
  msgElem.innerText = "喜んでいるよ！";

  vidElem.onended = () => {
    setTimeout(() => {
      loadN1();
      msgElem.innerText = "また遊んでね！";
    }, 3000);
  };
}

// ================================
// ペット選択
// ================================
petSelect.addEventListener("change", () => {
  currentPet = petSelect.value;
  loadN1();
});

// ================================
// 撫でる検知
// ================================
function setupTouchEvents() {
  const handle = () => triggerP2("touch");
  petContainer.addEventListener("touchmove", handle, { passive: true });
  petContainer.addEventListener("mousemove", (e) => {
    if (e.buttons === 1) handle();
  });
}

// ================================
// 音声認識（名前呼び + 褒め言葉）
// ================================
function setupSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  const recognition = new SR();
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const text = result[0].transcript.trim();
    const clean = normalize(text);

    if (detectPetName(clean)) return;
    if (detectPraise(clean)) return;

    if (!result.isFinal) {
      if (detectPetName(clean)) return;
      if (detectPraise(clean)) return;
    }
  };

  recognition.onend = () => recognition.start();
  recognition.start();
}

// 正規化
function normalize(text) {
  let t = text.replace(/\s/g, "").replace(/[。、]/g, "").toLowerCase();
  t = t.replace(/[ァ-ン]/g, s => String.fromCharCode(s.charCodeAt(0) - 0x60));
  return t;
}

// 名前呼び（強化版）
function detectPetName(t) {
  // Usako
  if (
    t.includes("うさ") || t.includes("さこ") ||
    t.includes("うさちゃん") || t.includes("うーちゃん") ||
    t.includes("usako") || t.includes("usa")
  ) {
    currentPet = "usako";
    petSelect.value = "usako";
    loadN1();
    triggerP2("name-usako");
    return true;
  }

  // Kuro（誤認識対策含む）
  if (
    t.includes("くろ") || t.includes("くろう") ||
    t.includes("くー")  || t.includes("kuro") ||
    t.includes("かっくろ") || t.includes("かくろ")
  ) {
    currentPet = "kuro";
    petSelect.value = "kuro";
    loadN1();
    triggerP2("name-kuro");
    return true;
  }

  // Taro
  if (
    t.includes("たろ") || t.includes("たろう") ||
    t.includes("たー") || t.includes("taro")
  ) {
    currentPet = "taro";
    petSelect.value = "taro";
    loadN1();
    triggerP2("name-taro");
    return true;
  }

  return false;
}

// 褒め言葉
function detectPraise(t) {
  if (
    t.includes("かわいい") || t.includes("可愛い") ||
    t.includes("おりこう") || t.includes("お利口") ||
    t.includes("よし") ||
    t.includes("いいこ") || t.includes("いい子") ||
    t.includes("すごいね") || t.includes("えらいね")
  ) {
    triggerP2("praise");
    return true;
  }
  return false;
}

// ================================
// ★ FaceMesh方式の笑顔検出（鋭さ最優先）
// ================================
let faceMesh = null;

async function setupFaceMesh() {
  console.log("[INIT] setupFaceMesh");

  faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  faceMesh.onResults(onFaceMeshResults);

  startFaceMeshCamera();
}

async function startFaceMeshCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  webcam.srcObject = stream;

  const camera = new Camera(webcam, {
    onFrame: async () => {
      await faceMesh.send({ image: webcam });
    },
    width: 300,
    height: 300,
  });

  camera.start();
}

function onFaceMeshResults(results) {
  if (!results.multiFaceLandmarks[0]) return;

  const lm = results.multiFaceLandmarks[0];

  const left   = lm[61];
  const right  = lm[291];
  const top    = lm[13];
  const bottom = lm[14];

  const mouthWidth  = Math.hypot(right.x - left.x, right.y - left.y);
  const mouthHeight = Math.hypot(bottom.x - top.x, bottom.y - top.y);

  const ratio = mouthHeight / mouthWidth;

  // console.log("ratio:", ratio);

  if (ratio > 0.35) {
    triggerP2("smile");
  }
}

// ================================
// カメラ（videoタグ）
// ================================
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" }
  });
  webcam.srcObject = stream;
}