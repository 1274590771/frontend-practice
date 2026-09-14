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

// ---------- 光源 ----------
scene.add(new THREE.AmbientLight(0x8899cc, 0.35));

// 太阳处的点光源：distance = 0 表示不衰减，让最外层行星和内侧行星亮度一致，
// 同时保留方向性，行星背面自然变暗形成明暗交界。
const sunLight = new THREE.PointLight(0xfff0cc, 1.7, 0, 0);
scene.add(sunLight);

// 冷色补光：避免背光面死黑
const fillLight = new THREE.DirectionalLight(0x5a7fd0, 0.35);
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
  return new THREE.CanvasTexture(canvas);
}

const glowTexture = radialTexture(128, [
  [0.00, 'rgba(255, 246, 220, 0.95)'],
  [0.35, 'rgba(255, 178, 66, 0.38)'],
  [1.00, 'rgba(255, 140, 30, 0)']
]);

// ---------- 太阳 ----------
const SUN_RADIUS = 3;

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS, 64, 48),
  new THREE.MeshBasicMaterial({ color: 0xffb845 })  // 基础材质：自身就是光源本体，不参与光照计算
);
scene.add(sun);

const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture,
  color: 0xffc766,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
}));
sunGlow.scale.setScalar(SUN_RADIUS * 5);
scene.add(sunGlow);

// 外层辉光壳：渲染背面 + 加法混合，形成一圈边缘光
const corona = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS * 1.28, 48, 32),
  new THREE.MeshBasicMaterial({
    color: 0xff9a2e,
    transparent: true,
    opacity: 0.18,
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
      color: 0x7fa3d8, transparent: true, opacity: 0.22,
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
    new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.85, metalness: 0.05 })
  );
  tilt.add(body);
  spinners.push({ object: body, speed: p.spin });

  // 地球大气层：半透明外壳 + 背面渲染，透出一圈蓝色边光
  if (p.name === '地球') {
    tilt.add(new THREE.Mesh(
      new THREE.SphereGeometry(p.radius * 1.06, 32, 24),
      new THREE.MeshBasicMaterial({
        color: 0x76b6ff, transparent: true, opacity: 0.22,
        side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false
      })
    ));
  }

  // 土星环：位于赤道面，因此挂在 tilt 层里跟着一起倾斜
  if (p.ring) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(p.radius * 1.45, p.radius * 2.35, 128),
      new THREE.MeshStandardMaterial({
        color: 0xe8d7a8, roughness: 1, side: THREE.DoubleSide,
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
      new THREE.MeshStandardMaterial({ color: 0xbfbfc4, roughness: 1 })
    );
    moon.position.x = p.moon.dist;
    moonPivot.add(moon);
    orbiters.push({ object: moonPivot, speed: p.moon.speed });
  }
});

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
  sunGlow.scale.setScalar(SUN_RADIUS * 5 * (1 + Math.sin(t * 1.6) * 0.05));
  sunGlow.material.opacity = 0.85 + Math.sin(t * 2.2) * 0.15;

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
