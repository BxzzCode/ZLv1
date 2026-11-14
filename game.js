import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js';
import { getDatabase, ref, get, set, update as updateData, remove, onValue, onDisconnect, runTransaction } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAIu5NvHQgoALehxDGkWxK7cpkNbdsLp-w',
  authDomain: 'zombieland-d91e2.firebaseapp.com',
  databaseURL: 'https://zombieland-d91e2-default-rtdb.firebaseio.com/',
  projectId: 'zombieland-d91e2',
  storageBucket: 'zombieland-d91e2.firebasestorage.app',
  messagingSenderId: '255444944870',
  appId: '1:255444944870:web:08cd6a0e998408f57cb827',
  measurementId: 'G-KQ7BZV9E0B'
};
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const database = getDatabase(firebaseApp);
let currentUser = null, currentRoomId = null, currentSlot = 0, roomUnsubscribe = null;
let roomIsHost = false;
let playersUnsubscribe = null;
let onlineStarted = false;
let playerSyncElapsed = 0;
const remotePlayers = new Map();

const $ = (id) => document.getElementById(id);
const sceneRoot = $('scene-root');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bcfe0);
scene.fog = new THREE.FogExp2(0xa9c9bb, 0.0062);
const camera = new THREE.PerspectiveCamera(61, innerWidth / innerHeight, 0.1, 260);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
const isMobile = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.15 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !isMobile; // sombras desactivadas en móviles para priorizar FPS
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
sceneRoot.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const worldUp = new THREE.Vector3(0, 1, 0);
const keys = Object.create(null);
const enemies = [];
const pickups = [];
const colliders = [];
let running = false, gameStarted = false, wave = 0, coins = 0, kills = 0;
let health = 100, ammo = 12, magazine = 12, reserveAmmo = 48, damage = 34;
let isReloading = false, reloadTimer = 0, waveDelay = 0, spawning = 0;
let fireHeld = false, pointerLocked = false, yaw = 0, pitch = -0.11;
let joystickVector = { x: 0, y: 0 }, jumpVelocity = 0, onGround = true, playerSpeed = 6.1;
let toastTimer = 0, messageTimer = 0, shootCooldown = 0, elapsed = 0;
const player = { position: new THREE.Vector3(0, 0, 0), velocity: new THREE.Vector3(), radius: 0.48 };
const playerModel = new THREE.Group();
const playerParts = {};
const mats = {};

function material(name, color, roughness = 0.85, metalness = 0) {
  if (!mats[name]) mats[name] = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return mats[name];
}
function mesh(geometry, mat, parent, x = 0, y = 0, z = 0, cast = true) {
  const obj = new THREE.Mesh(geometry, mat);
  obj.position.set(x, y, z);
  obj.castShadow = cast;
  obj.receiveShadow = true;
  parent.add(obj);
  return obj;
}
function box(parent, size, mat, pos, opts = {}) {
  const obj = mesh(new THREE.BoxGeometry(...size), mat, parent, ...pos);
  if (opts.rotation) obj.rotation.set(...opts.rotation);
  return obj;
}
function sphere(parent, radius, mat, pos, scale = [1, 1, 1], seg = 12) {
  const obj = mesh(new THREE.SphereGeometry(radius, seg, Math.max(8, seg - 2)), mat, parent, ...pos);
  obj.scale.set(...scale);
  return obj;
}

// Warm daylight, long shadows, and a clear open sky.
scene.add(new THREE.HemisphereLight(0xd8f2ff, 0x607344, 1.65));
const sun = new THREE.DirectionalLight(0xffe5b5, 3.2);
sun.position.set(-32, 52, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
sun.shadow.bias = -0.00025;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xb5d9e9, 0.7); fill.position.set(30, 18, -25); scene.add(fill);

// A softly varied, walkable clearing with a distant forest boundary.
const ground = mesh(new THREE.PlaneGeometry(220, 220, 1, 1), material('ground', 0x657c4b), scene, 0, -0.12, 0, false);
ground.rotation.x = -Math.PI / 2;
const groundDetail = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 90, 90), new THREE.MeshStandardMaterial({ color: 0x829058, roughness: 1, vertexColors: true }));
groundDetail.rotation.x = -Math.PI / 2; groundDetail.position.y = -0.105; groundDetail.receiveShadow = true;
const colors = [];
const posAttr = groundDetail.geometry.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
  const variation = 0.86 + Math.random() * 0.24;
  colors.push(variation, variation * (0.98 + Math.random() * 0.06), variation * (0.82 + Math.random() * 0.12));
}
groundDetail.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); scene.add(groundDetail);
// Scattered grass tufts add scale without cluttering the playable clearing.
const grassMat = material('grass', 0x8e9a52);
for (let i = 0; i < (isMobile ? 170 : 300); i++) {
  const x = (Math.random() - .5) * 190, z = (Math.random() - .5) * 190;
  if (Math.abs(x) < 17 && Math.abs(z) < 17) continue;
  const tuft = mesh(new THREE.ConeGeometry(.09 + Math.random() * .09, .38 + Math.random() * .38, 4), grassMat, scene, x, .13, z, false);
  tuft.rotation.z = (Math.random() - .5) * .45;
}

// Clouds and an explicit glowing sun disk make the sky feel alive.
const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(5, 28, 20), new THREE.MeshBasicMaterial({ color: 0xffedb2 }));
sunDisk.position.set(-72, 72, -125); scene.add(sunDisk);
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xf4f6e9, roughness: 1, transparent: true, opacity: .78 });
const clouds = [];
for (let i = 0; i < 8; i++) {
  const cloud = new THREE.Group();
  const puffCount = 4 + Math.floor(Math.random() * 4);
  for (let j = 0; j < puffCount; j++) sphere(cloud, 1.5 + Math.random() * 1.6, cloudMat, [j * 2.1, Math.random() * 1.2, Math.random() * 1.4], [1.3, .65, .85], 12);
  cloud.position.set((Math.random() - .5) * 190, 27 + Math.random() * 16, -70 - Math.random() * 100);
  cloud.scale.setScalar(.9 + Math.random() * 1.25); scene.add(cloud); clouds.push(cloud);
}

const trunkMat = material('trunk', 0x594634), leafMats = [material('leaf1', 0x365b3d), material('leaf2', 0x476d43), material('leaf3', 0x617a48)];
function createTree(x, z, scale = 1) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale); scene.add(group);
  const trunk = mesh(new THREE.CylinderGeometry(.23, .42, 3.5, 8), trunkMat, group, 0, 1.72, 0); trunk.rotation.z = (Math.random() - .5) * .12;
  for (let i = 0; i < 3; i++) {
    const crown = mesh(new THREE.ConeGeometry(2.1 - i * .28, 3.2, 8), leafMats[Math.floor(Math.random() * leafMats.length)], group, 0, 3.4 + i * 1.42, 0);
    crown.rotation.y = Math.random() * Math.PI;
  }
  colliders.push({ x, z, radius: .62 * scale, type: 'tree' });
}
function createRock(x, z, scale = 1) {
  const geo = new THREE.DodecahedronGeometry(1, 1);
  const rock = mesh(geo, material('rock' + Math.round(Math.random() * 3), [0x77796e, 0x858276, 0x666e69, 0x8a887e][Math.floor(Math.random() * 4)]), scene, x, .48 * scale, z);
  rock.scale.set(scale * (1.1 + Math.random() * .5), scale * (.55 + Math.random() * .4), scale * (.8 + Math.random() * .5));
  rock.rotation.set(Math.random() * .3, Math.random() * 4, Math.random() * .3);
  colliders.push({ x, z, radius: scale * .78, type: 'rock' });
}
// Dense perimeter, with an open center for combat.
for (let i = 0; i < (isMobile ? 65 : 90); i++) {
  const angle = Math.random() * Math.PI * 2, radius = 24 + Math.random() * 72;
  createTree(Math.cos(angle) * radius, Math.sin(angle) * radius, .75 + Math.random() * .9);
}
for (let i = 0; i < (isMobile ? 42 : 58); i++) {
  let x = (Math.random() - .5) * 175, z = (Math.random() - .5) * 175;
  if (Math.abs(x) < 8 && Math.abs(z) < 8) { x += Math.sign(x || 1) * 12; z += 12; }
  createRock(x, z, .45 + Math.random() * 1.35);
}
// A few fallen branches as environmental dressing.
for (let i = 0; i < 18; i++) {
  const x = (Math.random() - .5) * 100, z = (Math.random() - .5) * 100;
  if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
  const branch = mesh(new THREE.CylinderGeometry(.07, .11, 2.2, 6), trunkMat, scene, x, .11, z, false);
  branch.rotation.z = Math.PI / 2; branch.rotation.y = Math.random() * Math.PI;
}

function createHuman(isZombie = false) {
  const group = new THREE.Group();
  const skin = material(isZombie ? 'zskin' : 'skin', isZombie ? 0x91a17a : 0xd5a47e);
  const shirt = material(isZombie ? 'zshirt' : 'shirt', isZombie ? 0x4d5343 : 0x3b5148);
  const pants = material(isZombie ? 'zpants' : 'pants', isZombie ? 0x45443c : 0x303d40);
  const boots = material(isZombie ? 'zboots' : 'boots', 0x292b27);
  const head = new THREE.Group(); head.position.y = 1.61; group.add(head);
  sphere(head, .27, skin, [0, 0, 0], [.85, 1.12, .8], 14);
  sphere(head, .16, material(isZombie ? 'eyes' : 'eyesPlayer', isZombie ? 0xd84b30 : 0x423229), [-.105, .035, .205], [.36, .38, .16], 10);
  sphere(head, .16, material(isZombie ? 'eyes' : 'eyesPlayer', isZombie ? 0xd84b30 : 0x423229), [.105, .035, .205], [.36, .38, .16], 10);
  if (isZombie) {
    const wound = material('wound', 0x522d2a);
    sphere(head, .075, wound, [-.12, -.15, .218], [1.4, .7, .35], 8);
    box(head, [.34, .06, .17], material('jaw', 0x59654f), [0, -.19, .16]);
    // Ragged shoulder patches and torn clothing details.
    box(group, [.23, .25, .08], material('tear', 0x81846a), [-.28, 1.02, .19], { rotation: [0, 0, -.32] });
    box(group, [.16, .2, .08], wound, [.28, .72, .19], { rotation: [0, 0, .2] });
  }
  const torso = new THREE.Group(); torso.position.y = 1.02; group.add(torso);
  box(torso, [.74, .76, .38], shirt, [0, 0, 0]);
  box(torso, [.35, .7, .04], material(isZombie ? 'vest' : 'vestPlayer', isZombie ? 0x3e4738 : 0x65705c), [0, .01, .205]);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .48, 1.28, 0); group.add(arm);
    const limb = mesh(new THREE.CapsuleGeometry(.13, .55, 3, 7), shirt, arm, 0, -.36, 0);
    limb.rotation.z = side * -.12;
    sphere(arm, .13, skin, [0, -.72, 0], [1, 1.1, 1], 10);
    arms.push(arm);
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * .2, .67, 0); group.add(leg);
    mesh(new THREE.CapsuleGeometry(.16, .57, 3, 7), pants, leg, 0, -.33, 0);
    box(leg, [.29, .18, .43], boots, [0, -.69, .07]); legs.push(leg);
  }
  if (!isZombie) {
    // Shoulder straps and compact rifle held forward.
    box(torso, [.095, .73, .06], material('strap', 0x9b8b55), [-.17, 0, .24], { rotation: [0, 0, -.38] });
    const gun = new THREE.Group(); gun.position.set(.22, 1.07, .48); group.add(gun);
    box(gun, [.13, .14, .72], material('gunmetal', 0x283336, .42, .68), [0, 0, 0]);
    box(gun, [.17, .19, .3], material('gunbody', 0x38433d, .55, .35), [0, -.015, .16]);
    box(gun, [.07, .33, .11], material('gunmetal', 0x222d30, .42, .7), [0, -.22, -.05]);
    box(gun, [.07, .07, .37], material('barrel', 0x252d2d, .38, .7), [0, .04, -.46]);
    playerParts.gun = gun;
  }
  group.userData = { head, torso, arms, legs, phase: Math.random() * 10 };
  return group;
}

function createPlayerNameTag(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(5, 15, 18, 0.78)';
  ctx.beginPath();
  ctx.roundRect(12, 12, 488, 104, 24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(201, 243, 106, 0.9)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f1f7e9';
  ctx.fillText(String(label).slice(0, 20), 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(2.15, .54, 1);
  sprite.userData.label = String(label);
  sprite.position.set(0, 2.55, 0);
  return sprite;
}
function addRemotePlayer(uid, data) {
  const model = createHuman(false);
  model.scale.setScalar(1.02);
  const nameTag = createPlayerNameTag(data.name || 'JUGADOR');
  model.add(nameTag);
  scene.add(model);
  const position = data.position || {};
  model.position.set(Number(position.x) || 0, Number(position.y) || 0, Number(position.z) || 0);
  model.rotation.y = Number(data.yaw) || 0;
  remotePlayers.set(uid, {
    model, nameTag,
    target: new THREE.Vector3(model.position.x, model.position.y, model.position.z),
    targetYaw: model.rotation.y,
    targetPitch: Number(data.pitch) || 0,
    lastSeen: Date.now()
  });
}
function removeRemotePlayer(uid) {
  const remote = remotePlayers.get(uid);
  if (!remote) return;
  scene.remove(remote.model);
  remote.model.traverse(obj => {
    if (obj.isSprite) {
      obj.material.map?.dispose();
      obj.material.dispose();
    }
  });
  remotePlayers.delete(uid);
}
function stopPlayerSync() {
  if (playersUnsubscribe) { playersUnsubscribe(); playersUnsubscribe = null; }
  if (currentRoomId && currentUser) {
    remove(ref(database, `rooms/${currentRoomId}/players/${currentUser.uid}`)).catch(() => {});
  }
  for (const uid of [...remotePlayers.keys()]) removeRemotePlayer(uid);
  onlineStarted = false;
}
async function startPlayerSync() {
  if (!currentRoomId || !currentUser || playersUnsubscribe) return;
  const playersRef = ref(database, `rooms/${currentRoomId}/players`);
  const ownPlayerRef = ref(database, `rooms/${currentRoomId}/players/${currentUser.uid}`);
  await onDisconnect(ownPlayerRef).remove();
  playersUnsubscribe = onValue(playersRef, snapshot => {
    const players = snapshot.val() || {};
    const active = new Set(Object.keys(players));
    for (const uid of [...remotePlayers.keys()]) {
      if (!active.has(uid)) removeRemotePlayer(uid);
    }
    for (const [uid, data] of Object.entries(players)) {
      if (!data || uid === currentUser.uid) continue;
      if (!remotePlayers.has(uid)) addRemotePlayer(uid, data);
      const remote = remotePlayers.get(uid);
      const p = data.position || {};
      remote.target.set(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0);
      remote.targetYaw = Number(data.yaw) || 0;
      remote.targetPitch = Number(data.pitch) || 0;
      remote.lastSeen = Date.now();
      if (remote.nameTag.userData.label !== data.name) {
        scene.remove(remote.model);
        removeRemotePlayer(uid);
        addRemotePlayer(uid, data);
      }
    }
  }, error => console.warn('Error sincronizando jugadores:', error));
}
async function publishLocalPlayer() {
  if (!currentRoomId || !currentUser || !running || !onlineStarted) return;
  const payload = {
    name: `JUGADOR ${currentSlot}`,
    slot: currentSlot,
    position: { x: Number(player.position.x.toFixed(3)), y: Number(player.position.y.toFixed(3)), z: Number(player.position.z.toFixed(3)) },
    yaw: Number(yaw.toFixed(4)),
    pitch: Number(pitch.toFixed(4)),
    updatedAt: Date.now()
  };
  try {
    await set(ref(database, `rooms/${currentRoomId}/players/${currentUser.uid}`), payload);
  } catch (error) {
    console.warn('No se pudo sincronizar la posición:', error);
  }
}
function updateRemotePlayers(dt) {
  for (const remote of remotePlayers.values()) {
    remote.model.position.lerp(remote.target, Math.min(1, dt * 12));
    let deltaYaw = THREE.MathUtils.euclideanModulo(remote.targetYaw - remote.model.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    remote.model.rotation.y += deltaYaw * Math.min(1, dt * 12);
    remote.model.userData.head.rotation.x = THREE.MathUtils.clamp(remote.targetPitch * .3, -.25, .25);
  }
}

const playerMesh = createHuman(false); playerMesh.scale.setScalar(1.02); scene.add(playerMesh);
playerModel.add(playerMesh);
// Modelo local oculto en primera persona; brazos y arma visibles junto a la cámara.
playerMesh.visible = false;
const viewRig = new THREE.Group(); camera.add(viewRig); scene.add(camera);
const armMat = material('fpArm', 0x9b765d), sleeveMat = material('fpSleeve', 0x34463f), gunMat = material('fpGun', 0x263238, .38, .72);
const fpArmL = mesh(new THREE.CapsuleGeometry(.105, .42, 3, 7), armMat, viewRig, -.34, -.34, -.55); fpArmL.rotation.z = -.28;
const fpArmR = mesh(new THREE.CapsuleGeometry(.105, .42, 3, 7), armMat, viewRig, .27, -.34, -.58); fpArmR.rotation.z = .24;
box(viewRig, [.22,.2,.42], sleeveMat, [-.34,-.55,-.52]); box(viewRig,[.22,.2,.42],sleeveMat,[.27,-.55,-.55]);
const fpGun = new THREE.Group(); fpGun.position.set(.08,-.29,-.78); viewRig.add(fpGun);
box(fpGun,[.16,.17,.62],gunMat,[0,0,0]); box(fpGun,[.19,.2,.25],material('fpGunBody',0x45534a,.5,.4),[0,-.015,.12]);
box(fpGun,[.075,.31,.12],gunMat,[0,-.2,-.02]); box(fpGun,[.075,.075,.34],gunMat,[0,.035,-.43]);
// Tres puntos de aparición reservados para una sala de hasta 3 jugadores.
const spawnPoints = [new THREE.Vector3(-4.2, 0, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(4.2, 0, 0)];
const spawnMarkers = [];
spawnPoints.forEach((point, index) => {
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.13, 32), new THREE.MeshBasicMaterial({ color: index === 0 ? 0xc9f36a : 0x8ca49a, transparent: true, opacity: .38, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(point.x, .018, point.z); scene.add(ring); spawnMarkers.push(ring);
});

function updateHealthUI() {
  $('player-health').textContent = Math.ceil(health);
  $('player-health-fill').style.width = `${Math.max(0, health)}%`;
  $('player-health-fill').style.background = health < 31 ? 'linear-gradient(90deg,#e75548,#ff8660)' : 'linear-gradient(90deg,#e87959,#c9f36a)';
  $('ammo-count').textContent = ammo;
  $('ammo-total').textContent = reserveAmmo;
  $('ammo-fill').style.width = `${ammo / magazine * 100}%`;
  $('coin-count').textContent = coins;
  $('shop-coins').textContent = coins;
  $('wave-number').textContent = String(Math.max(1, wave)).padStart(2, '0');
  $('player-level').textContent = `LVL ${String(Math.min(100, Math.max(1, wave))).padStart(2, '0')}`;
}
function toast(text) {
  const el = $('toast'); el.textContent = text; el.classList.add('show'); toastTimer = 2.2;
}
function centerMessage(title, subtitle = '', duration = 2) {
  const el = $('center-message'); el.innerHTML = `${title}${subtitle ? `<small>${subtitle}</small>` : ''}`; messageTimer = duration;
}

function createPickup(type, x, z, amount) {
  const group = new THREE.Group(); group.position.set(x, .42, z); scene.add(group);
  const isCoin = type === 'coin';
  const color = isCoin ? 0xffd45c : 0xd8423e;
  const baseMat = new THREE.MeshStandardMaterial({ color, metalness: isCoin ? .78 : .12, roughness: isCoin ? .27 : .52, emissive: color, emissiveIntensity: .14 });
  if (isCoin) {
    const token = mesh(new THREE.CylinderGeometry(.27, .27, .075, 20), baseMat, group, 0, 0, 0);
    token.rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(.19, .025, 6, 16), material('coinEdge', 0xffed9a, .28, .7), group, 0, 0, .045);
    const mark = mesh(new THREE.BoxGeometry(.06, .19, .025), material('coinMark', 0xffed9a, .28, .6), group, 0, 0, .055);
    mark.rotation.z = .25;
  } else {
    box(group, [.5, .35, .34], baseMat, [0, 0, 0]);
    box(group, [.14, .39, .36], material('medCross', 0xf2eee0), [0, .01, .015]);
    box(group, [.39, .14, .37], material('medCross2', 0xf2eee0), [0, .01, .015]);
    box(group, [.54, .07, .37], material('medkitTrim', 0x91332d), [0, .2, 0]);
  }
  const halo = new THREE.Mesh(new THREE.TorusGeometry(isCoin ? .42 : .48, .012, 5, 28), new THREE.MeshBasicMaterial({ color: isCoin ? 0xffd45c : 0xf5f2d8, transparent: true, opacity: .45 }));
  halo.rotation.x = Math.PI / 2; halo.position.y = -.28; group.add(halo);
  pickups.push({ type, amount, group, baseY: .42, phase: Math.random() * 8 });
}

function createZombie(x, z) {
  const model = createHuman(true);
  const scale = .91 + Math.random() * .2;
  model.scale.setScalar(scale); model.position.set(x, 0, z); scene.add(model);
  const bar = document.createElement('div'); bar.className = 'enemy-bar'; bar.innerHTML = `<span>ZOMBI</span><div class="enemy-bar-track"><i></i></div>`; $('enemy-bars').appendChild(bar);
  const hp = 100 + Math.min(150, (wave - 1) * 8);
  enemies.push({ model, bar, health: hp, maxHealth: hp, speed: 1.15 + Math.random() * .45 + Math.min(.8, wave * .008), attack: 0, phase: Math.random() * 8, alive: true, scale });
}
function startWave() {
  wave = Math.min(100, wave + 1); spawning = 4 + Math.min(20, Math.floor(wave * .7));
  waveDelay = 1.6;
  $('wave-status').textContent = 'ALERTA'; updateHealthUI();
  centerMessage(`OLEADA ${String(wave).padStart(2, '0')}`, `${spawning} HOSTILES DETECTADOS`, 2.5);
}
function spawnWaveEnemy() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 20 + Math.random() * 13;
  const x = player.position.x + Math.cos(angle) * radius;
  const z = player.position.z + Math.sin(angle) * radius;
  createZombie(x, z);
}
function killEnemy(enemy) {
  enemy.alive = false;
  scene.remove(enemy.model); enemy.bar.remove();
  const idx = enemies.indexOf(enemy); if (idx !== -1) enemies.splice(idx, 1);
  kills++;
  const reward = 8 + Math.floor(Math.random() * 8) + Math.min(10, Math.floor(wave / 10));
  createPickup('coin', enemy.model.position.x, enemy.model.position.z, reward);
  if (Math.random() < .12) createPickup('medkit', enemy.model.position.x + (Math.random() - .5), enemy.model.position.z + (Math.random() - .5), 25);
  toast(`+${reward} MONEDAS · BOTÍN EN EL SUELO`);
}
function damagePlayer(amount) {
  if (!running) return;
  health = Math.max(0, health - amount); updateHealthUI();
  $('damage-flash').classList.add('hit'); setTimeout(() => $('damage-flash').classList.remove('hit'), 140);
  if (health <= 0) {
    running = false; fireHeld = false;
    centerMessage('HAS CAÍDO', `ELIMINASTE ${kills} HOSTILES · OLEADA ${wave}`, 999);
    setTimeout(() => { $('menu-screen').classList.add('active'); $('hud').classList.add('hidden'); }, 2400);
  }
}
function reload() {
  if (isReloading || ammo >= magazine || reserveAmmo <= 0 || !running) return;
  isReloading = true; reloadTimer = 1.35; $('reload-label').textContent = 'RECARGANDO...';
  setTimeout(() => { if (isReloading) { const amount = Math.min(magazine - ammo, reserveAmmo); ammo += amount; reserveAmmo -= amount; isReloading = false; $('reload-label').textContent = 'R · RECARGAR'; updateHealthUI(); } }, 1350);
}
function shoot() {
  if (!running || shootCooldown > 0 || isReloading) return;
  if (ammo <= 0) { reload(); return; }
  shootCooldown = .22; ammo--; updateHealthUI();
  // Aim through screen center; enemy hitboxes are tested against the shot ray.
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hitTargets = [];
  for (const enemy of enemies) {
    const target = enemy.model.position.clone(); target.y += 1.12;
    const to = target.clone().sub(raycaster.ray.origin);
    const along = to.dot(raycaster.ray.direction);
    if (along < 0 || along > 65) continue;
    const closest = raycaster.ray.at(along, new THREE.Vector3());
    const dist = closest.distanceTo(target);
    if (dist < .72 * enemy.scale) hitTargets.push({ enemy, along, dist });
  }
  hitTargets.sort((a, b) => a.along - b.along);
  if (hitTargets.length) {
    const hit = hitTargets[0]; hit.enemy.health -= damage;
    const fill = hit.enemy.bar.querySelector('i'); if (fill) fill.style.width = `${Math.max(0, hit.enemy.health / hit.enemy.maxHealth * 100)}%`;
    hit.enemy.model.userData.torso.rotation.x = -.16;
    if (hit.enemy.health <= 0) killEnemy(hit.enemy);
  }
  // Short-lived visible tracer from the weapon toward the center of the view.
  const origin = player.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  const end = raycaster.ray.at(20, new THREE.Vector3());
  const points = [origin, end]; const geom = new THREE.BufferGeometry().setFromPoints(points);
  const tracer = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: 0xffe7a1, transparent: true, opacity: .85 })); scene.add(tracer); setTimeout(() => { scene.remove(tracer); geom.dispose(); }, 65);
  if (ammo === 0 && reserveAmmo > 0) setTimeout(reload, 200);
}

function applyCollision(next) {
  for (const c of colliders) {
    const dx = next.x - c.x, dz = next.z - c.z, min = player.radius + c.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || .001;
      next.x = c.x + dx / d * min; next.z = c.z + dz / d * min;
    }
  }
  next.x = THREE.MathUtils.clamp(next.x, -103, 103); next.z = THREE.MathUtils.clamp(next.z, -103, 103);
  return next;
}
function movePlayer(dt) {
  const forwardInput = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - joystickVector.y;
  const sideInput = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joystickVector.x;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = forward.multiplyScalar(forwardInput).add(right.multiplyScalar(sideInput));
  if (move.lengthSq() > 1) move.normalize();
  const next = player.position.clone().addScaledVector(move, playerSpeed * dt);
  applyCollision(next); player.position.x = next.x; player.position.z = next.z;
  if (onGround) player.position.y = 0;
  else { jumpVelocity -= 17 * dt; player.position.y += jumpVelocity * dt; if (player.position.y <= 0) { player.position.y = 0; onGround = true; jumpVelocity = 0; } }
  playerMesh.position.copy(player.position); playerMesh.position.y += player.position.y;
  playerMesh.rotation.y = yaw; // reservado para representar al jugador en multijugador
  const moving = move.lengthSq() > .02;
  const phase = elapsed * (moving ? 10 : 2.5) + playerMesh.userData.phase;
  playerMesh.userData.legs[0].rotation.x = moving ? Math.sin(phase) * .48 : 0;
  playerMesh.userData.legs[1].rotation.x = moving ? -Math.sin(phase) * .48 : 0;
  playerMesh.userData.arms[0].rotation.x = moving ? -Math.sin(phase) * .23 : -.14;
  playerMesh.userData.arms[1].rotation.x = moving ? Math.sin(phase) * .23 : -.12;
  playerMesh.position.y += moving ? Math.abs(Math.sin(phase)) * .035 : 0;
}
function updateCamera(dt) {
  // Cámara FPS: altura de ojos y rotación directa del ratón o del tacto.
  camera.position.set(player.position.x, 1.58 + player.position.y, player.position.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.rotation.z = 0;
  viewRig.position.set(0, 0, 0);
}

function updateEnemies(dt) {
  for (const enemy of [...enemies]) {
    const pos = enemy.model.position, dx = player.position.x - pos.x, dz = player.position.z - pos.z;
    const dist = Math.hypot(dx, dz);
    enemy.phase += dt;
    const data = enemy.model.userData;
    if (dist > 1.18) {
      const step = Math.min(enemy.speed * dt, dist - 1.0);
      const next = new THREE.Vector3(pos.x + dx / dist * step, 0, pos.z + dz / dist * step);
      for (const c of colliders) {
        const ox = next.x - c.x, oz = next.z - c.z, minimum = c.radius + .42;
        if (ox * ox + oz * oz < minimum * minimum) { const l = Math.hypot(ox, oz) || 1; next.x = c.x + ox / l * minimum; next.z = c.z + oz / l * minimum; }
      }
      pos.x = next.x; pos.z = next.z;
      enemy.model.rotation.y = Math.atan2(dx, dz);
      const stride = Math.sin(enemy.phase * 8);
      data.legs[0].rotation.x = stride * .56; data.legs[1].rotation.x = -stride * .56;
      data.arms[0].rotation.x = -.6 + stride * .28; data.arms[1].rotation.x = -.6 - stride * .28;
      data.torso.rotation.z = Math.sin(enemy.phase * 4) * .035;
    } else {
      enemy.attack -= dt;
      data.arms[0].rotation.x = -.9; data.arms[1].rotation.x = -.9;
      if (enemy.attack <= 0) { damagePlayer(7 + Math.min(8, Math.floor(wave / 12))); enemy.attack = 1.05; }
    }
    enemy.model.position.y = Math.sin(enemy.phase * 3) * .025;
    const p = pos.clone(); p.y += 2.25 * enemy.scale; p.project(camera);
    const x = (p.x * .5 + .5) * innerWidth, y = (-p.y * .5 + .5) * innerHeight;
    if (p.z < 1 && x > -80 && x < innerWidth + 80 && y > -60 && y < innerHeight + 60) {
      enemy.bar.style.display = 'block'; enemy.bar.style.left = `${x}px`; enemy.bar.style.top = `${y}px`;
    } else enemy.bar.style.display = 'none';
  }
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const item = pickups[i]; item.phase += dt * 2.1;
    item.group.position.y = item.baseY + Math.sin(item.phase) * .12;
    item.group.rotation.y += dt * (item.type === 'coin' ? 1.7 : .35);
    const dx = player.position.x - item.group.position.x, dz = player.position.z - item.group.position.z;
    if (dx * dx + dz * dz < 1.65) {
      if (item.type === 'coin') { coins += item.amount; toast(`+${item.amount} MONEDAS`); }
      else { const actual = Math.min(25, 100 - health); health = Math.min(100, health + 25); toast(`BOTIQUÍN · +${actual} VIDA`); updateHealthUI(); }
      scene.remove(item.group); pickups.splice(i, 1); updateHealthUI();
    }
  }
}
function update(dt) {
  elapsed += dt;
  if (shootCooldown > 0) shootCooldown -= dt;
  for (const cloud of clouds) { cloud.position.x += dt * .19; if (cloud.position.x > 110) cloud.position.x = -110; }
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('show');
  if (messageTimer > 0 && (messageTimer -= dt) <= 0) $('center-message').innerHTML = '';
  if (!running) return;
  movePlayer(dt); updateCamera(dt); updateEnemies(dt); updatePickups(dt);
  if (fireHeld) shoot();
  if (spawning > 0) {
    waveDelay -= dt;
    if (waveDelay <= 0) { spawnWaveEnemy(); spawning--; waveDelay = Math.max(.38, .92 - wave * .005); $('wave-status').textContent = `HOSTILES ${enemies.length + spawning}`; }
  } else if (enemies.length === 0 && gameStarted) {
    $('wave-status').textContent = 'SECTOR LIMPIO';
    if (wave < 100) { waveDelay -= dt; if (waveDelay <= 0) { waveDelay = 3.5; startWave(); } }
    else { centerMessage('SECTOR ASEGURADO', 'HAS SOBREVIVIDO A LAS 100 OLEADAS', 999); running = false; }
  } else $('wave-status').textContent = `HOSTILES ${enemies.length + spawning}`;
  updateHealthUI();
}


// --- Firebase matchmaking (salas de 2 a 4 jugadores) ---
const roomFeedback = (message) => { const el = $('match-feedback'); if (el) el.textContent = message; };
const roomCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const roomPath = (id, child = '') => ref(database, `rooms/${id}${child ? `/${child}` : ''}`);
let hostRotationTimer = null;
let latestRoomState = null;

function clearHostRotationTimer() {
  if (hostRotationTimer) { clearTimeout(hostRotationTimer); hostRotationTimer = null; }
}
async function ensureAnonymousAuth() {
  if (auth.currentUser) { currentUser = auth.currentUser; return currentUser; }
  roomFeedback('Conectando con Firebase...');
  const credential = await signInAnonymously(auth);
  currentUser = credential.user;
  return currentUser;
}
function occupiedRoomSlots(room) {
  return [1,2,3,4].filter(n => !!room?.slots?.[n]);
}
function myRoomSlot(room) {
  const found = Object.entries(room?.slots || {}).find(([, uid]) => uid === currentUser?.uid);
  return found ? Number(found[0]) : 0;
}
async function rotatePublicHost(room) {
  if (!currentRoomId || !currentUser || room?.public !== true || room.status !== 'waiting') return;
  const occupied = occupiedRoomSlots(room);
  if (occupied.length !== 4 || !room.fullAt) return;

  const oldHost = room.hostUid || null;
  if (!oldHost || oldHost !== currentUser.uid) return;
  const history = room.hostHistory || {};
  const candidates = occupied
    .map(slot => room.slots[slot])
    .filter(uid => uid && uid !== oldHost && !history[uid]);
  if (!candidates.length) {
    roomFeedback('Todos los demás jugadores ya fueron anfitriones en esta sala.');
    return;
  }

  // El anfitrión nuevo se elige al azar. Nadie cambia de slot ni es expulsado.
  const nextHost = candidates[Math.floor(Math.random() * candidates.length)];
  await updateData(roomPath(currentRoomId, `hostHistory/${oldHost}`), true);
  const result = await runTransaction(roomPath(currentRoomId, 'hostUid'), value => {
    if (value !== oldHost) return;
    return nextHost;
  });
  if (result.committed) {
    await updateData(roomPath(currentRoomId), { hostRotationAt: Date.now() });
    roomFeedback('Cambió el anfitrión. El jugador anterior sigue en la partida.');
  }
}
function schedulePublicHostRotation(room) {
  clearHostRotationTimer();
  if (room.public !== true || room.status !== 'waiting' || occupiedRoomSlots(room).length !== 4 || !room.fullAt) return;
  const baseTime = Number(room.hostRotationAt || room.fullAt);
  const remaining = Math.max(0, baseTime + 15000 - Date.now());
  hostRotationTimer = setTimeout(async () => {
    try {
      const snap = await get(roomPath(currentRoomId));
      const latest = snap.val();
      if (latest && latest.public === true && latest.status === 'waiting' && occupiedRoomSlots(latest).length === 4) {
        await rotatePublicHost(latest);
      }
    } catch (error) { console.warn('No se pudo cambiar el anfitrión:', error); }
  }, remaining);
}
async function maintainPublicFullTimer(room) {
  if (room.public !== true || room.status !== 'waiting') return;
  const count = occupiedRoomSlots(room).length;
  const fullAtRef = roomPath(currentRoomId, 'fullAt');
  if (count === 4 && !room.fullAt) {
    await runTransaction(fullAtRef, value => value == null ? Date.now() : value);
  } else if (count < 4 && room.fullAt) {
    await updateData(roomPath(currentRoomId), { fullAt: null, hostRotationAt: null });
  }
}
function renderRoom(room) {
  if (!room) { clearHostRotationTimer(); latestRoomState = null; roomFeedback('La sala ya no existe.'); resetRoomUI(); return; }
  latestRoomState = room;
  $('room-panel').classList.remove('hidden');
  const isPublicRoom = room.public === true;
  $('room-code').textContent = isPublicRoom ? 'PARTIDA PÚBLICA' : (currentRoomId || '------');
  $('room-code').classList.toggle('hidden', isPublicRoom);
  $('copy-room-code').classList.toggle('hidden', isPublicRoom);
  const roomHeadingLabel = $('room-heading-label');
  if (roomHeadingLabel) roomHeadingLabel.textContent = isPublicRoom ? 'PARTIDA PÚBLICA' : 'SALA PRIVADA';
  const slots = $('room-slots');
  slots.innerHTML = [1,2,3,4].map(n => {
    const uid = room.slots?.[n];
    const own = uid && uid === currentUser?.uid;
    const isHost = uid && uid === room.hostUid;
    return `<span>JUGADOR ${n}${isHost ? '<br>ANFITRIÓN' : ''}<br><b>${own ? 'VOS' : uid ? 'CONECTADO' : 'ESPERANDO'}</b></span>`;
  }).join('');
  const count = occupiedRoomSlots(room).length;
  const full = count === 4;
  $('room-status').textContent = room.status === 'playing'
    ? 'PARTIDA INICIADA'
    : `${count}/4 JUGADORES · MÍNIMO 2 PARA INICIAR${isPublicRoom && full ? ' · CAMBIO DE ANFITRIÓN EN 15 S' : ''}`;
  const wasHost = roomIsHost;
  roomIsHost = room.hostUid === currentUser?.uid;
  currentSlot = myRoomSlot(room) || currentSlot;
  if (!wasHost && roomIsHost) registerHostDisconnect(currentRoomId).catch(console.warn);
  $('start-online').disabled = !roomIsHost || count < 2 || count > 4 || room.status !== 'waiting';
  if (isPublicRoom && count === 4 && room.fullAt) schedulePublicHostRotation(room);
  else clearHostRotationTimer();
  if (isPublicRoom && room.status === 'waiting') maintainPublicFullTimer(room).catch(console.warn);
  if (room.status === 'playing' && !running) startOnlineGame(room);
}
function watchRoom(id) {
  if (roomUnsubscribe) roomUnsubscribe();
  roomUnsubscribe = onValue(roomPath(id), snap => renderRoom(snap.val()), error => roomFeedback(`Error de sala: ${error.message}`));
}
function resetRoomUI() {
  clearHostRotationTimer();
  latestRoomState = null;
  currentRoomId = null; currentSlot = 0; roomIsHost = false;
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
  $('room-panel').classList.add('hidden');
}
async function registerHostDisconnect(id) {
  await onDisconnect(roomPath(id, 'hostUid')).remove();
  await onDisconnect(roomPath(id, `hostHistory/${currentUser.uid}`)).set(true);
}
async function registerSlotDisconnect(id, slot) {
  await onDisconnect(roomPath(id, `slots/${slot}`)).remove();
  if (roomIsHost) await registerHostDisconnect(id);
}
async function createRoom(isPublic = false) {
  try {
    await ensureAnonymousAuth();
    if (currentRoomId) await leaveRoom();
    const id = roomCode();
    const room = {
      hostUid: currentUser.uid, public: isPublic, status: 'waiting',
      createdAt: Date.now(), fullAt: null, hostRotationAt: null,
      hostHistory: {},
      slots: { 1: currentUser.uid, 2: null, 3: null, 4: null }
    };
    await set(roomPath(id), room);
    currentRoomId = id; currentSlot = 1; roomIsHost = true;
    if (isPublic) {
      // Las públicas sobreviven a la desconexión del anfitrión para que otro
      // jugador pueda ocupar un espacio libre y asumir el puesto 1.
      await registerSlotDisconnect(id, 1);
    } else {
      // Las privadas se cierran si se desconecta su anfitrión; no hay rotación automática.
      await onDisconnect(roomPath(id)).remove();
    }
    watchRoom(id);
    roomFeedback(isPublic ? 'Buscando jugadores para una partida pública...' : 'Grupo privado creado. Compartí el código con tus amigos.');
  } catch (error) { roomFeedback(`No se pudo crear la sala: ${error.message}`); }
}
async function tryJoinRoom(id, expectedPublic) {
  const snap = await get(roomPath(id));
  if (!snap.exists()) return false;
  let room = snap.val();
  if (room.public !== expectedPublic || room.status !== 'waiting') return false;

  // Cualquier espacio libre sirve. El slot identifica al jugador y no cambia
  // cuando cambia el rol de anfitrión.
  let joinedSlot = 0;
  for (const slot of [1,2,3,4]) {
    const result = await runTransaction(roomPath(id, `slots/${slot}`), value => value == null ? currentUser.uid : undefined);
    if (result.committed) { joinedSlot = slot; break; }
  }
  if (!joinedSlot) return false;

  currentRoomId = id;
  currentSlot = joinedSlot;
  roomIsHost = room.hostUid === currentUser.uid;
  await registerSlotDisconnect(id, joinedSlot);

  let freshSnap = await get(roomPath(id));
  let freshRoom = freshSnap.val();

  // Si el anfitrión de una pública se fue, el siguiente que entra puede
  // asumir el rol desde cualquier slot libre. Los anfitriones anteriores
  // quedan guardados en hostHistory y no pueden repetir en esta misma sala.
  if (expectedPublic && !freshRoom.hostUid) {
    const history = freshRoom.hostHistory || {};
    const eligible = occupiedRoomSlots(freshRoom)
      .map(slot => freshRoom.slots[slot])
      .filter(uid => uid && !history[uid]);
    if (eligible.includes(currentUser.uid)) {
      const claim = await runTransaction(roomPath(id, 'hostUid'), value => value == null ? currentUser.uid : undefined);
      if (claim.committed) {
        roomIsHost = true;
        await registerHostDisconnect(id);
      }
    }
  }

  freshSnap = await get(roomPath(id));
  freshRoom = freshSnap.val();
  if (expectedPublic && occupiedRoomSlots(freshRoom).length === 4 && !freshRoom.fullAt) {
    await updateData(roomPath(id), { fullAt: Date.now(), hostRotationAt: null });
  }
  watchRoom(id);
  roomFeedback(roomIsHost
    ? 'Te uniste a la partida pública y sos el anfitrión.'
    : 'Te uniste a la sala. Esperá a que el anfitrión inicie.');
  return true;
}
async function searchPublicMatch() {
  try {
    await ensureAnonymousAuth();
    if (currentRoomId) await leaveRoom();
    roomFeedback('Buscando una partida pública...');
    const snap = await get(ref(database, 'rooms'));
    if (snap.exists()) {
      for (const [id, room] of Object.entries(snap.val())) {
        const count = occupiedRoomSlots(room).length;
        if (room.public === true && room.status === 'waiting' && count < 4) {
          if (await tryJoinRoom(id, true)) return;
        }
      }
    }
    await createRoom(true);
  } catch (error) { roomFeedback(`No se pudo buscar partida: ${error.message}`); }
}
async function joinPrivateRoom() {
  try {
    await ensureAnonymousAuth();
    const id = $('room-code-input').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(id)) { roomFeedback('Ingresá un código de sala de 6 caracteres.'); return; }
    if (currentRoomId) await leaveRoom();
    if (!await tryJoinRoom(id, false)) roomFeedback('No se pudo entrar: el código privado no existe, está lleno, el anfitrión se desconectó o la partida ya comenzó.');
  } catch (error) { roomFeedback(`Error al unirse: ${error.message}`); }
}
async function leaveRoom() {
  if (!currentRoomId || !currentSlot) { resetRoomUI(); return; }
  const id = currentRoomId, slot = currentSlot, wasHost = roomIsHost, wasPublic = latestRoomState?.public === true;
  try {
    clearHostRotationTimer();
    if (playersUnsubscribe) { playersUnsubscribe(); playersUnsubscribe = null; }
    if (currentUser) {
      await onDisconnect(roomPath(id, `players/${currentUser.uid}`)).cancel();
      await remove(roomPath(id, `players/${currentUser.uid}`));
    }
    for (const uid of [...remotePlayers.keys()]) removeRemotePlayer(uid);
    onlineStarted = false;
    await onDisconnect(roomPath(id, `slots/${slot}`)).cancel();
    await remove(roomPath(id, `slots/${slot}`));
    if (wasHost && wasPublic) {
      await updateData(roomPath(id, `hostHistory/${currentUser.uid}`), true);
      await onDisconnect(roomPath(id, 'hostUid')).cancel();
      await remove(roomPath(id, 'hostUid'));
      await updateData(roomPath(id), { fullAt: null, hostRotationAt: null });
    } else if (wasHost && !wasPublic) {
      await onDisconnect(roomPath(id)).cancel();
      await remove(roomPath(id));
    }
  } catch (error) { console.warn('No se pudo limpiar la sala:', error); }
  resetRoomUI();
}
async function startOnlineMatch() {
  if (!roomIsHost || !currentRoomId) return;
  try {
    const snap = await get(roomPath(currentRoomId));
    const room = snap.val();
    const count = occupiedRoomSlots(room).length;
    if (!room || room.status !== 'waiting') { roomFeedback('La sala ya no está esperando jugadores.'); return; }
    if (count < 2) { roomFeedback('Necesitás al menos 2 jugadores para iniciar.'); return; }
    if (count > 4) { roomFeedback('La sala admite un máximo de 4 jugadores.'); return; }
    await updateData(roomPath(currentRoomId), { status: 'playing', startedAt: Date.now() });
  } catch (error) { roomFeedback(`No se pudo iniciar: ${error.message}`); }
}
function startOnlineGame(room) {
  if (onlineStarted) return;
  const slot = currentSlot || myRoomSlot(room) || 1;
  currentSlot = Number(slot);
  player.position.copy(spawnPoints[currentSlot - 1]);
  enterGame('online');
  onlineStarted = true;
  startPlayerSync().then(() => publishLocalPlayer()).catch(error => console.warn('No se pudo iniciar la sincronización:', error));
  toast(`PARTIDA ONLINE · JUGADOR ${currentSlot}`);
}
$('public-match')?.addEventListener('click', searchPublicMatch);
$('create-room')?.addEventListener('click', () => createRoom(false));
$('join-room')?.addEventListener('click', joinPrivateRoom);
$('start-online')?.addEventListener('click', startOnlineMatch);
$('leave-room')?.addEventListener('click', leaveRoom);
$('copy-room-code')?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(currentRoomId || ''); roomFeedback('Código copiado.'); }
  catch { roomFeedback(`Compartí este código: ${currentRoomId}`); }
});

function enterGame(mode = 'solo') {
  if (!gameStarted || health <= 0) {
    gameStarted = true; health = 100; wave = 0; kills = 0; coins = 0; ammo = magazine; reserveAmmo = 48;
    player.position.copy(spawnPoints[mode === 'solo' ? 1 : mode === 'online' ? Math.max(0, currentSlot - 1) : 0]); yaw = 0; pitch = -0.06; enemies.forEach(e => { scene.remove(e.model); e.bar.remove(); }); enemies.length = 0;
    pickups.forEach(p => scene.remove(p.group)); pickups.length = 0;
    startWave();
  }
  $('menu-screen').classList.remove('active'); $('mode-screen').classList.remove('active'); $('shop-screen').classList.remove('active'); $('hud').classList.remove('hidden');
  $('center-message').innerHTML = ''; running = true; updateHealthUI();
  if (matchMedia('(pointer:fine)').matches) renderer.domElement.requestPointerLock?.();
}
function openShop() { $('shop-coins').textContent = coins; $('shop-screen').classList.add('active'); }
function leaveToMenu() {
  running = false; fireHeld = false; document.exitPointerLock?.(); $('hud').classList.add('hidden'); $('menu-screen').classList.add('active'); $('shop-screen').classList.remove('active');
}

$('enter-button').addEventListener('click', () => $('mode-screen').classList.add('active'));
$('close-mode').addEventListener('click', () => $('mode-screen').classList.remove('active'));
$('solo-mode').addEventListener('click', () => enterGame('solo'));
$('match-mode').addEventListener('click', () => $('match-info').classList.remove('hidden'));
$('back-modes').addEventListener('click', () => { $('match-info').classList.add('hidden'); });
$('shop-button').addEventListener('click', openShop);
$('exit-button').addEventListener('click', () => { toast('LA ZONA SIGUE ESPERÁNDOTE'); $('exit-button').querySelector('span').textContent = '✓'; setTimeout(() => $('exit-button').querySelector('span').textContent = '↗', 1400); });
$('pause-button').addEventListener('click', leaveToMenu);
document.querySelectorAll('[data-close-shop]').forEach(button => button.addEventListener('click', () => $('shop-screen').classList.remove('active')));
document.querySelectorAll('[data-buy]').forEach(button => button.addEventListener('click', () => {
  const cost = Number(button.dataset.cost), item = button.dataset.buy;
  if (coins < cost) { $('shop-coins').textContent = coins; button.textContent = 'FALTAN ◉'; setTimeout(() => button.textContent = `${cost} ◉`, 1000); return; }
  coins -= cost;
  if (item === 'medkit') { health = Math.min(100, health + 25); updateHealthUI(); }
  if (item === 'ammo') { magazine += 4; ammo += 4; reserveAmmo += 12; }
  if (item === 'damage') damage += 9;
  updateHealthUI(); $('shop-coins').textContent = coins; toast('SUMINISTRO ADQUIRIDO');
}));

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') reload();
  if ((e.code === 'Space' || e.code === 'KeyJ') && running && onGround) { onGround = false; jumpVelocity = 7.1; }
  if (e.code === 'Escape' && running && !pointerLocked) leaveToMenu();
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('mousemove', e => {
  if (pointerLocked && running) { yaw -= e.movementX * .0022; pitch = THREE.MathUtils.clamp(pitch - e.movementY * .0015, -.62, .25); }
});
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === renderer.domElement; });
// En pantallas táctiles, arrastrar el lado derecho gira la cámara sin interferir con el joystick.
let lookPointer = null, lastLookX = 0, lastLookY = 0;
renderer.domElement.addEventListener('pointerdown', e => { if (isMobile && running && e.clientX > innerWidth * .38) { lookPointer = e.pointerId; lastLookX = e.clientX; lastLookY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener('pointermove', e => { if (lookPointer === e.pointerId) { const dx = e.clientX - lastLookX, dy = e.clientY - lastLookY; yaw -= dx * .004; pitch = THREE.MathUtils.clamp(pitch - dy * .003, -1.15, .65); lastLookX = e.clientX; lastLookY = e.clientY; } });
function stopLook(e) { if (lookPointer === e.pointerId) lookPointer = null; }
renderer.domElement.addEventListener('pointerup', stopLook); renderer.domElement.addEventListener('pointercancel', stopLook);
renderer.domElement.addEventListener('click', () => { if (running && matchMedia('(pointer:fine)').matches && !pointerLocked) renderer.domElement.requestPointerLock?.(); });
renderer.domElement.addEventListener('mousedown', e => { if (e.button === 0 && running) fireHeld = true; });
document.addEventListener('mouseup', e => { if (e.button === 0) fireHeld = false; });
$('fire-button').addEventListener('pointerdown', e => { e.preventDefault(); fireHeld = true; });
$('fire-button').addEventListener('pointerup', () => fireHeld = false);
$('fire-button').addEventListener('pointercancel', () => fireHeld = false);
$('jump-button').addEventListener('pointerdown', e => { e.preventDefault(); if (running && onGround) { onGround = false; jumpVelocity = 7.1; } });
const joystick = $('joystick'), knob = $('joystick-knob'); let joystickPointer = null;
function setJoystick(e) {
  const r = joystick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy; const max = r.width * .34, len = Math.hypot(dx, dy);
  if (len > max) { dx *= max / len; dy *= max / len; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  joystickVector = { x: dx / max, y: dy / max };
}
joystick.addEventListener('pointerdown', e => { joystickPointer = e.pointerId; joystick.setPointerCapture(e.pointerId); setJoystick(e); });
joystick.addEventListener('pointermove', e => { if (e.pointerId === joystickPointer) setJoystick(e); });
function resetJoystick() { joystickPointer = null; joystickVector = { x: 0, y: 0 }; knob.style.transform = 'translate(0,0)'; }
joystick.addEventListener('pointerup', resetJoystick); joystick.addEventListener('pointercancel', resetJoystick);

let fpsFrames = 0, fpsElapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  fpsFrames++; fpsElapsed += dt; if (fpsElapsed >= .6) { $('fps-counter').textContent = `${Math.round(fpsFrames / fpsElapsed)} FPS`; fpsFrames = 0; fpsElapsed = 0; }
  update(dt);
  updateRemotePlayers(dt);
  if (running && onlineStarted) {
    playerSyncElapsed += dt;
    if (playerSyncElapsed >= .1) {
      playerSyncElapsed = 0;
      publishLocalPlayer();
    }
  }
  if (!running) updateCamera(dt);
  renderer.render(scene, camera);
}
function resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); const isMobile = matchMedia('(pointer:coarse)').matches || innerWidth < 760;
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.15 : 1.5)); }
window.addEventListener('resize', resize);
updateCamera(1); updateHealthUI(); animate();
setTimeout(() => $('loading-screen').classList.add('done'), 900);
