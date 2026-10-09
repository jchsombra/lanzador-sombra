import "./style.css";
import * as THREE from "three";
import { createD10, showNumber } from "./dice.js";
import OBR from "@owlbear-rodeo/sdk";

const CANAL_TIRADA = "lanzador-sombra/tirada";
const MAX_HISTORIAL = 10;

// --- Sonido de dados (sintetizado) ---
let audioCtx = null;

function asegurarAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function sonidoDados() {
  const ctx = asegurarAudio();
  const now = ctx.currentTime;

  for (let i = 0; i < 6; i++) {
    const t = now + i * 0.07 + Math.random() * 0.05;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(220 + Math.random() * 260, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.05);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }
}

// --- Cache de nombres de jugadores ---
const nombresCache = new Map();

// --- Utilidad: escapar HTML para evitar problemas con nombres raros ---
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

OBR.onReady(async () => {
  console.log("SDK de Owlbear listo. Inicializando lanzador...");

  const miId = await OBR.player.getId();

  // Precargamos los nombres de los jugadores conectados
  const playersIniciales = await OBR.party.getPlayers();
  playersIniciales.forEach((p) => nombresCache.set(p.id, p.name));

  // Actualizamos el cache cuando alguien entra o sale
  OBR.party.onChange((party) => {
    party.forEach((p) => nombresCache.set(p.id, p.name));
  });

  // --- Escena 3D ---
  const container = document.getElementById("dice-container");

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    40,
    container.clientWidth / container.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 0, 7);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  // Luces
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 5, 6);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-4, -2, 4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.4);
  rim.position.set(-3, 4, -6);
  scene.add(rim);

  // Dados
  const SHOW_NUMBERS = true;

  const dS = createD10("#111111", "#ffffff", SHOW_NUMBERS);
  const dMayor = createD10("#f5f5f5", "#111111", SHOW_NUMBERS);
  const dMenor = createD10("#f5f5f5", "#111111", SHOW_NUMBERS);

  dS.position.set(-1.8, 0, 0);
  dMayor.position.set(0, 0, 0);
  dMenor.position.set(1.8, 0, 0);

  scene.add(dS, dMayor, dMenor);

  // --- Lógica del Sistema Sombra ---
  function tiradaSombra() {
    const dSVal = Math.floor(Math.random() * 10) + 1;
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    return {
      dS: dSVal,
      dMayor: Math.max(a, b),
      dMenor: Math.min(a, b),
    };
  }

  function mostrarResultado(vS, vM, vm, conSonido) {
    showNumber(dS, vS);
    showNumber(dMayor, vM);
    showNumber(dMenor, vm);

    const total = vS + vM + vm;
    document.querySelector(".resultado").textContent = `Suma: ${total}`;

    if (conSonido) {
      sonidoDados();
    }
  }

  // --- Historial ---
  const historial = [];

  function agregarAlHistorial(playerId, vS, vM, vm) {
    const nombre = nombresCache.get(playerId) || "Jugador";
    const total = vS + vM + vm;
    historial.unshift({ nombre, total, vS, vM, vm });
    if (historial.length > MAX_HISTORIAL) historial.pop();
    renderHistorial();
  }

  function renderHistorial() {
    const contenedor = document.querySelector(".historial");
    if (!contenedor) return;
    contenedor.innerHTML = historial
      .map(
        (h) => `
        <div class="historial-item">
          <span class="historial-nombre">${escapeHtml(h.nombre)}</span>
          <span class="historial-suma">${h.total}</span>
          <span class="historial-detalle">(${h.vS}, ${h.vM}, ${h.vm})</span>
        </div>`
      )
      .join("");
  }

  // --- Lanzar dados ---
  function lanzar() {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const { dS: vS, dMayor: vM, dMenor: vm } = tiradaSombra();
    mostrarResultado(vS, vM, vm, true);
    agregarAlHistorial(miId, vS, vM, vm);

    OBR.broadcast.sendMessage(CANAL_TIRADA, {
      playerId: miId,
      dS: vS,
      dMayor: vM,
      dMenor: vm,
    });
  }

  // --- Animación ---
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();

  // --- Botón de relanzar ---
  document.querySelector(".relanzar").addEventListener("click", lanzar);

  // --- Primera tirada (sin sonido, sin broadcast, sin historial) ---
  const { dS: vS0, dMayor: vM0, dMenor: vm0 } = tiradaSombra();
  mostrarResultado(vS0, vM0, vm0, false);

  // --- Escucha de tiradas de otros jugadores ---
  OBR.broadcast.onMessage(CANAL_TIRADA, (event) => {
    const { playerId, dS: rS, dMayor: rM, dMenor: rm } = event.data;
    mostrarResultado(rS, rM, rm, false);
    agregarAlHistorial(playerId, rS, rM, rm);
  });

  // --- Ajuste responsivo ---
  window.addEventListener("resize", () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
});