/* 星球宇宙 —— 太阳系微缩模型
 *
 * 骨架沿用 three-d/showcase.js：底座 + 环绕展品组 + 缓转动画 + 双光源 + resize 适配。
 * 主题换成太阳系：
 *   底座   → 太阳（自发光球体 + 光晕精灵 + 辉光壳）
 *   展品组 → 公转枢轴 → 行星（轴倾角 → 球体 / 土星环 / 大气层）
 *   缓转   → 行星公转 + 自转 + 卫星绕行 + 太阳脉动
 *   双光源 → 太阳处点光源（点出昼夜明暗交界）+ 环境光 + 冷色补光
 */

// ---------- 渲染基础 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 18, 42);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 6;      // 别钻进太阳
controls.maxDistance = 130;    // 别飞出星空壳

// r128 把 material.color 当作线性空间的值，经过 sRGBEncoding 输出后整体会偏白，
// 于是十六进制色写进去、屏上却是另一个颜色。这里统一先转到线性空间，
// 屏幕上显示的才真正是下面写的那个色值。
const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();

// ---------- 光源 ----------
scene.add(new THREE.AmbientLight(srgb(0x8899cc), 0.32));

// 太阳处的点光源：distance = 0 表示不衰减，让最外层行星和内侧行星亮度一致，
// 同时保留方向性，行星背面自然变暗形成明暗交界。
// 强度压在 1.15：再高会把木星、土星这类浅色行星打到过曝发白。
const sunLight = new THREE.PointLight(srgb(0xfff0cc), 1.15, 0, 0);
scene.add(sunLight);

// 冷色补光：避免背光面死黑
const fillLight = new THREE.DirectionalLight(srgb(0x5a7fd0), 0.35);
fillLight.position.set(-1, 0.6, 1);
scene.add(fillLight);

// ---------- 画布贴图：程序化生成，不依赖外部资源 ----------
function radialTexture(size, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([offset, color]) => g.addColorStop(offset, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;   // canvas 里画的是 sRGB 颜色，交给渲染器时先解码
  return texture;
}

const glowTexture = radialTexture(128, [
  [0.00, 'rgba(255, 236, 190, 0.90)'],
  [0.22, 'rgba(255, 170, 60, 0.30)'],
  [0.55, 'rgba(255, 130, 30, 0.10)'],
  [1.00, 'rgba(255, 110, 20, 0)']
]);

const starTexture = radialTexture(64, [
  [0.00, 'rgba(255, 255, 255, 1)'],
  [0.40, 'rgba(255, 255, 255, 0.55)'],
  [1.00, 'rgba(255, 255, 255, 0)']
]);

// 行星标签：文字画进 canvas 再贴到 Sprite 上，Sprite 始终正对相机，不会被转歪
function makeLabel(text, color) {
  const font = 'bold 40px "Microsoft YaHei", "PingFang SC", sans-serif';
  const ruler = document.createElement('canvas').getContext('2d');
  ruler.font = font;

  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(ruler.measureText(text).width) + 24;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.encoding = THREE.sRGBEncoding;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false
  }));
  const LABEL_HEIGHT = 0.5;
  sprite.scale.set(LABEL_HEIGHT * canvas.width / height, LABEL_HEIGHT, 1);
  return sprite;
}

// ---------- 太阳 ----------
const SUN_RADIUS = 3;

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 64, 48),
  new THREE.MeshBasicMaterial({ color: srgb(0xffae35) })  // 基础材质：自身就是光源本体，不参与光照计算
);
scene.add(sun);

const SUN_GLOW_SCALE = SUN_RADIUS * 3.6;

const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture,
  color: srgb(0xffc766),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
}));
sunGlow.scale.setScalar(SUN_GLOW_SCALE);
scene.add(sunGlow);

// 外层辉光壳：渲染背面 + 加法混合。注意背面加法混合会在球体轮廓处堆叠，
// 壳越小这圈"镶边"越像一道硬边的褐色环，所以这里放大到 1.6 倍并把不透明度压到 0.07，
// 只留一层很淡的暖色外晕。
const corona = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS * 1.6, 48, 32),
  new THREE.MeshBasicMaterial({
    color: srgb(0xff9a2e),
    transparent: true,
    opacity: 0.07,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
scene.add(corona);

// ---------- 行星参数 ----------
// dist：公转半径；orbit / spin：公转、自转角速度（弧度/秒）；tilt：轴倾角
const PLANETS = [
  { name: '水星', radius: 0.45, dist: 6.5,  color: 0xa39d99, orbit: 0.90, spin: 0.7 },
  { name: '金星', radius: 0.70, dist: 8.8,  color: 0xe3b071, orbit: 0.66, spin: 0.5 },
  { name: '地球', radius: 0.78, dist: 11.6, color: 0x3f7fd4, orbit: 0.48, spin: 0.9, tilt: 0.41,
    moon: { radius: 0.21, dist: 1.7, speed: 3.0 } },
  { name: '火星', radius: 0.55, dist: 14.3, color: 0xc0563a, orbit: 0.38, spin: 0.8, tilt: 0.44 },
  { name: '木星', radius: 1.70, dist: 19.0, color: 0xd2ac7d, orbit: 0.22, spin: 1.6, tilt: 0.05 },
  { name: '土星', radius: 1.45, dist: 24.0, color: 0xdfc78f, orbit: 0.16, spin: 1.3, tilt: 0.47, ring: true },
  { name: '天王星', radius: 1.00, dist: 28.5, color: 0x9adfe6, orbit: 0.11, spin: 0.9, tilt: 1.71 }
];

const orbitGroup = new THREE.Group();
const planetGroup = new THREE.Group();
scene.add(orbitGroup, planetGroup);

const orbiters = [];   // 绕中心公转的对象
const spinners = [];   // 绕自转轴旋转的对象

PLANETS.forEach((p, index) => {
  // 轨道环：细圆环平铺在黄道面上
  const orbit = new THREE.Mesh(
    new THREE.RingGeometry(p.dist - 0.035, p.dist + 0.035, 180),
    new THREE.MeshBasicMaterial({
      color: srgb(0x7fa3d8), transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  orbit.rotation.x = -Math.PI / 2;
  orbitGroup.add(orbit);

  // 公转枢轴：随机初始相位，避免所有行星排成一条直线
  const pivot = new THREE.Group();
  pivot.rotation.y = (index / PLANETS.length) * Math.PI * 2 + Math.random() * 0.8;
  planetGroup.add(pivot);
  orbiters.push({ object: pivot, speed: p.orbit });

  // holder：把行星推到距离太阳 dist 的位置，自身不旋转
  const holder = new THREE.Group();
  holder.position.x = p.dist;
  pivot.add(holder);

  // 轴倾角单独一层，自转只作用于更内层的球体
  const tilt = new THREE.Group();
  tilt.rotation.z = p.tilt || 0;
  holder.add(tilt);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(p.radius, 48, 32),
    new THREE.MeshStandardMaterial({ color: srgb(p.color), roughness: 0.85, metalness: 0.05 })
  );
  tilt.add(body);
  spinners.push({ object: body, speed: p.spin });

  // 地球大气层：半透明外壳 + 背面渲染，透出一圈蓝色边光
  if (p.name === '地球') {
    tilt.add(new THREE.Mesh(
      new THREE.SphereGeometry(p.radius * 1.06, 32, 24),
      new THREE.MeshBasicMaterial({
        color: srgb(0x76b6ff), transparent: true, opacity: 0.22,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
      })
    ));
  }

  // 土星环：位于赤道面，因此挂在 tilt 层里跟着一起倾斜
  if (p.ring) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(p.radius * 1.45, p.radius * 2.35, 128),
      new THREE.MeshStandardMaterial({
        color: srgb(0xe8d7a8), roughness: 1, side: THREE.DoubleSide,
        transparent: true, opacity: 0.85
      })
    );
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }

  // 卫星：独立枢轴挂在 holder 上，绕行星中心转，同时被公转带着走
  if (p.moon) {
    const moonPivot = new THREE.Group();
    holder.add(moonPivot);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(p.moon.radius, 24, 16),
      new THREE.MeshStandardMaterial({ color: srgb(0xbfbfc4), roughness: 1 })
    );
    moon.position.x = p.moon.dist;
    moonPivot.add(moon);
    orbiters.push({ object: moonPivot, speed: p.moon.speed });
  }

  // 行星标签：挂在 holder 上跟随公转，颜色取行星色的提亮版
  const labelColor = new THREE.Color(p.color).lerp(new THREE.Color(0xffffff), 0.45);
  const label = makeLabel(p.name, '#' + labelColor.getHexString());
  label.position.set(0, p.radius + 0.72, 0);
  holder.add(label);
});

// ---------- 星空背景 ----------
const STAR_COUNT = 4000;
const starPositions = new Float32Array(STAR_COUNT * 3);
const starColors = new Float32Array(STAR_COUNT * 3);
const starTint = new THREE.Color();

for (let i = 0; i < STAR_COUNT; i++) {
  const radius = 140 + Math.random() * 460;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);

  starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = radius * Math.cos(phi) * 0.6;   // 竖向压扁，接近银盘分布
  starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

  // 多数偏冷白，少数偏暖，避免星空一片死白
  starTint.setHSL(Math.random() < 0.7 ? 0.58 : 0.10, 0.25, 0.75 + Math.random() * 0.25);
  starColors[i * 3] = starTint.r;
  starColors[i * 3 + 1] = starTint.g;
  starColors[i * 3 + 2] = starTint.b;
}

const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

const starfield = new THREE.Points(starGeometry, new THREE.PointsMaterial({
  size: 2.4, map: starTexture, vertexColors: true, sizeAttenuation: true,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
}));
scene.add(starfield);

// ---------- 小行星带 ----------
const BELT_COUNT = 1400;
const beltPositions = new Float32Array(BELT_COUNT * 3);

for (let i = 0; i < BELT_COUNT; i++) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 16.3 + Math.random() * 1.6;   // 卡在火星(14.3)与木星(19.0)之间
  beltPositions[i * 3] = Math.cos(angle) * radius;
  beltPositions[i * 3 + 1] = (Math.random() - 0.5) * 0.9;
  beltPositions[i * 3 + 2] = Math.sin(angle) * radius;
}

const beltGeometry = new THREE.BufferGeometry();
beltGeometry.setAttribute('position', new THREE.BufferAttribute(beltPositions, 3));

const asteroidBelt = new THREE.Points(beltGeometry, new THREE.PointsMaterial({
  color: srgb(0x9a8b78), size: 0.14, sizeAttenuation: true,
  transparent: true, opacity: 0.9, depthWrite: false
}));
scene.add(asteroidBelt);

// ---------- 动画循环 ----------
const clock = new THREE.Clock();

const animate = () => {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);   // 限制单帧步长，切标签页回来不会瞬移
  const t = clock.elapsedTime;

  orbiters.forEach((o) => { o.object.rotation.y += o.speed * dt; });
  spinners.forEach((s) => { s.object.rotation.y += s.speed * dt; });

  sun.rotation.y += 0.06 * dt;
  corona.rotation.y -= 0.04 * dt;

  // 太阳脉动
  sunGlow.scale.setScalar(SUN_GLOW_SCALE * (1 + Math.sin(t * 1.6) * 0.05));
  sunGlow.material.opacity = 0.85 + Math.sin(t * 2.2) * 0.15;

  // 背景层极缓自转 + 小行星带缓慢漂移，给静止的深空一点呼吸感
  starfield.rotation.y += 0.012 * dt;
  asteroidBelt.rotation.y += 0.035 * dt;

  controls.update();
  renderer.render(scene, camera);
};
animate();

// ---------- 窗口适配 ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
