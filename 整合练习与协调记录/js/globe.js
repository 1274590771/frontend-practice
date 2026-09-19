// 三维模块（进阶）
// 四座城市按真实经纬度贴在球面上：柱高 = 当前时段降水累计，颜色 = 当前时段平均气温。
// 时段口径与首页看板共用 js/data.js，所以在两页看到的降水与气温应当一致；
// 首页点「在三维地球上查看」会带上 ?city=&period=，进来直接定位到那座城市。

const globeParams = new URLSearchParams(location.search);
const pickedCity = globeParams.get('city') || 'all';
const activePeriod = periodById(globeParams.get('period') || 'all');

const GLOBE_RADIUS = 3;
const BAR_MIN = 0.4;
const BAR_MAX = 1.9;

// 经纬度 -> 球面坐标，纬度 90° 落在 +Y
const latLonToVector3 = (lat, lon, radius) => {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
};

// r128 把材质颜色当线性空间处理，配合 outputEncoding=sRGB 输出会整体偏白，
// 所以写入前统一 convertSRGBToLinear，和 my-scene 里星球配色的处理保持一致
const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();

// 气温映射到冷暖色：-20℃ 偏蓝，30℃ 偏红
const tempColor = (temp) => {
  const ratio = Math.min(Math.max((temp + 20) / 50, 0), 1);
  return new THREE.Color().setHSL((1 - ratio) * 0.62, 0.75, 0.5).convertSRGBToLinear();
};

// 求把某个经纬度转到正对相机（+Z）所需的绕 Y 旋转角
const rotationToFace = (lat, lon) => {
  const p = latLonToVector3(lat, lon, 1);
  return Math.atan2(-p.x, p.z);
};

// 文字画进 canvas 再贴到 Sprite，Sprite 始终正对相机，球面转到背面也不会被转歪
const makeLabel = (text, color) => {
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

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  // 四座城市集中在东亚一带，标签放小一点，减少互相压字
  const labelHeight = 0.28;
  sprite.scale.set((labelHeight * canvas.width) / height, labelHeight, 1);
  return sprite;
};

// ── 场景 ──
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1a2b);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
// 相机拉远一点，球体不顶到四角，右上角说明面板不会盖住转过来的城市标记
camera.position.set(0, 3, 10.8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 5;
controls.maxDistance = 16;

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sunLight = new THREE.DirectionalLight(0xffffff, 0.9);
sunLight.position.set(6, 8, 6);
scene.add(sunLight);

const globeGroup = new THREE.Group();
// 默认视角先把球转到东经 110° 一带，四座城市一进页面就朝向相机
globeGroup.rotation.y = rotationToFace(35, 110);
scene.add(globeGroup);

// 球体与经纬网：不用贴图，经纬线直接用线几何画出来，离线也能看
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(GLOBE_RADIUS, 48, 32),
  new THREE.MeshStandardMaterial({ color: srgb(0x0e2c47), roughness: 1, metalness: 0 })
);
globeGroup.add(globe);

const graticuleMaterial = new THREE.LineBasicMaterial({
  color: srgb(0x5f9fd0),
  transparent: true,
  opacity: 0.5
});

// 纬线圈：每 30° 一条，赤道单独提亮
for (let lat = -60; lat <= 60; lat += 30) {
  const points = [];
  for (let lon = -180; lon <= 180; lon += 3) {
    points.push(latLonToVector3(lat, lon, GLOBE_RADIUS * 1.001));
  }
  const isEquator = lat === 0;
  const circle = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    isEquator
      ? new THREE.LineBasicMaterial({ color: srgb(0x9fd8ff), transparent: true, opacity: 0.8 })
      : graticuleMaterial
  );
  globeGroup.add(circle);
}

// 经线圈：每 30° 一条
for (let lon = -180; lon < 180; lon += 30) {
  const points = [];
  for (let lat = -90; lat <= 90; lat += 3) {
    points.push(latLonToVector3(lat, lon, GLOBE_RADIUS * 1.001));
  }
  globeGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), graticuleMaterial));
}

// ── 城市标记 ──
const upAxis = new THREE.Vector3(0, 1, 0);

const addCityMarker = (coord, rainTotal, tempAvg, maxRain) => {
  const isPicked = pickedCity !== 'all' && pickedCity === coord.name;
  const dimmed = pickedCity !== 'all' && !isPicked;

  const surface = latLonToVector3(coord.lat, coord.lon, GLOBE_RADIUS);
  const normal = surface.clone().normalize();
  // 柱高按当期降水在四城中的占比归一化，最低留一段让降水少的城市也看得见
  const barHeight = BAR_MIN + (BAR_MAX - BAR_MIN) * (maxRain > 0 ? rainTotal / maxRain : 0);

  const color = tempColor(tempAvg);
  if (dimmed) {
    color.lerp(srgb(0x2a3b4d), 0.55);
  }

  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.085, barHeight, 12),
    new THREE.MeshStandardMaterial({
      color: color,
      emissive: isPicked ? color.clone().multiplyScalar(0.5) : new THREE.Color(0x000000),
      roughness: 0.4
    })
  );
  bar.position.copy(normal.clone().multiplyScalar(GLOBE_RADIUS + barHeight / 2));
  bar.quaternion.setFromUnitVectors(upAxis, normal);
  globeGroup.add(bar);

  const headRadius = isPicked ? 0.14 : 0.1;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(headRadius, 16, 12),
    new THREE.MeshStandardMaterial({ color: color, roughness: 0.35 })
  );
  head.position.copy(normal.clone().multiplyScalar(GLOBE_RADIUS + barHeight));
  globeGroup.add(head);

  const label = makeLabel(coord.name, isPicked ? '#ffe082' : '#dbeafe');
  label.position.copy(normal.clone().multiplyScalar(GLOBE_RADIUS + barHeight + 0.32));
  if (dimmed) label.material.opacity = 0.45;
  globeGroup.add(label);
};

// 选中城市时把球转到它正对相机，否则缓慢自转
let autoRotate = pickedCity === 'all';
let targetRotationY = null;
const shortestAngle = (from, to) => {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

const focusCity = (coord) => {
  targetRotationY = rotationToFace(coord.lat, coord.lon);
  autoRotate = false;
};

const showStatus = (text) => {
  const el = document.querySelector('#globe-status');
  el.textContent = text;
  el.style.display = 'block';
};

// ── 初始化 ──
const init = async () => {
  const demo = new URLSearchParams(location.search).get('demo');
  const months = activePeriod.months;
  let data = null;
  try {
    if (demo === 'error') throw new Error('HTTP 500');
    data = await loadWeather('../data/weather.json');
    if (demo === 'empty') {
      data.cities = [];
      data.metrics.rainfall.series = [];
      data.metrics.temperature.series = [];
    }
    if (data.metrics.rainfall.series.length === 0) {
      showStatus('暂无数据');
      document.querySelector('#globe-period').textContent = '时段：' + activePeriod.label;
      return;
    }
  } catch (error) {
    showStatus('加载失败：' + error.message);
    return;
  }

  const rainOf = (series) => sumRange(series.counts, months);
  const tempOf = (series) => avgRange(series.counts, months);

  const rainfall = data.metrics.rainfall.series;
  const temperature = data.metrics.temperature.series;
  const maxRain = Math.max(...rainfall.map(rainOf));

  data.cities.forEach((coord) => {
    const rainRow = rainfall.find((s) => s.category === coord.name);
    const tempRow = temperature.find((s) => s.category === coord.name);
    if (!rainRow || !tempRow) return;
    addCityMarker(coord, rainOf(rainRow), tempOf(tempRow), maxRain);
  });

  const picked = data.cities.find((c) => c.name === pickedCity);
  if (picked) focusCity(picked);

  const scope = pickedCity === 'all' ? '全部城市' : pickedCity;
  document.querySelector('#globe-period').textContent =
    '时段：' + activePeriod.label + ' · 范围：' + scope;
};

const animate = () => {
  requestAnimationFrame(animate);
  if (autoRotate) {
    globeGroup.rotation.y += 0.002;
  } else if (targetRotationY !== null) {
    const delta = shortestAngle(globeGroup.rotation.y, targetRotationY);
    if (Math.abs(delta) > 0.001) {
      globeGroup.rotation.y += delta * 0.08;
    }
  }
  controls.update();
  renderer.render(scene, camera);
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
init();
