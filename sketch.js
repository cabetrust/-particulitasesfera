/**
 * Fluido dentro de esfera con inercia expansiva real
 * p5.js + WEBGL + Audio
 */

let particles = [];
let nParticles = 2500;
let noiseScale = 0.008;
let sphereRadius;
let mic, fft;

// Rotación acumulativa real del mundo
let rotX = 0;
let rotY = 0;

// Velocidad angular
let prevRotX = 0;
let prevRotY = 0;
let rotVelX = 0;
let rotVelY = 0;

// Mouse drag
let lastMouseX = 0;
let lastMouseY = 0;

// Física
let gravity;

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);

  sphereRadius = min(width, height) * 0.4;
  background(5);

  mic = new p5.AudioIn();
  mic.start();

  fft = new p5.FFT();
  fft.setInput(mic);

  // Gravedad suave
  gravity = createVector(0, 0.028, 0);

  for (let i = 0; i < nParticles; i++) {
    particles.push(new Particle(sphereRadius));
  }
}

function draw() {
  background(5, 5, 15);

  // -----------------------------
  // AUDIO
  // -----------------------------
  fft.analyze();
  let volume = mic.getLevel();
  let bass = fft.getEnergy("bass");
  let treble = fft.getEnergy("treble");

  let flowIntensity = map(bass, 0, 255, 0.032, 0.03);
  let speedMult = map(volume, 0, 0.5, 0.8, 4.2);
  let alphaVal = map(volume, 0, 0.3, 50, 200);

  // -----------------------------
  // VELOCIDAD ANGULAR
  // -----------------------------
  rotVelX = rotX - prevRotX;
  rotVelY = rotY - prevRotY;
  prevRotX = rotX;
  prevRotY = rotY;

  // -----------------------------
  // DIBUJO DEL MUNDO
  // -----------------------------
  rotateX(rotX);
  rotateY(rotY);

  // Caparazón
  push();
  noFill();
  stroke(100, 100, 255, 20);
  strokeWeight(0.5);
  ellipsoid(sphereRadius, sphereRadius, sphereRadius, 24, 24);
  pop();

  // Partículas
  for (let p of particles) {
    p.update(flowIntensity, speedMult, gravity, rotVelX, rotVelY, treble);
    p.constrainToSphere(sphereRadius);
    p.show(volume, alphaVal);
  }
}

class Particle {
  constructor(r) {
    this.pos = randomPointInSphere(r * 0.95);
    this.vel = p5.Vector.random3D().mult(random(0.2, 1.2));
    this.acc = createVector(0, 0, 0);

    this.maxSpeed = 4.2;
    this.drag = 0.992;

    // Memoria de inercia
    this.spinMemory = createVector(0, 0, 0);

    let colors = [
      color(0, 255, 255),
      color(100, 100, 255),
      color(200, 0, 255),
      color(255, 255, 255)
    ];
    this.baseColor = random(colors);
  }

  update(intensity, speedMult, gravity, rotVelX, rotVelY, treble) {
    this.acc.set(0, 0, 0);

    // -----------------------------
    // FLOW FIELD ORGÁNICO
    // -----------------------------
    let nX = this.pos.x * noiseScale;
    let nY = this.pos.y * noiseScale;
    let nZ = this.pos.z * noiseScale;
    let time = frameCount * intensity;

    let angleX = noise(nX, nY, nZ, time) * TWO_PI;
    let angleY = noise(nX + 100, nY + 100, nZ + 100, time) * TWO_PI;

    let flow = p5.Vector.fromAngles(angleX, angleY);
    flow.setMag(map(treble, 0, 255, 0.02, 0.08));
    this.acc.add(flow);

    // -----------------------------
    // GRAVEDAD
    // -----------------------------
    this.acc.add(gravity);

    // -----------------------------
    // LEVITACIÓN / BUOYANCY SUAVE
    // -----------------------------
    // Evita que todo colapse abajo o al medio
    let buoyancy = createVector(0, -0.012, 0);
    this.acc.add(buoyancy);

    // -----------------------------
    // INERCIA POR ROTACIÓN (EXPANSIVA)
    // -----------------------------
    // Esta fuerza genera slosh + expansión real
    let inertia = createVector(
      this.pos.z * rotVelY * -4.5,
      this.pos.z * rotVelX *  4.5,
      this.pos.x * rotVelY *  2.8 + this.pos.y * rotVelX * -2.8
    );

    // componente radial: que se ABRAN cuando girás
    let radial = this.pos.copy().normalize();
    let angularPower = abs(rotVelX) + abs(rotVelY);
    radial.mult(angularPower * 2.8);

    inertia.add(radial);
    inertia.limit(4.0);

    // -----------------------------
    // MEMORIA DE GIRO
    // -----------------------------
    // Hace que la expansión no muera instantáneamente
    this.spinMemory.lerp(inertia, 0.18);
    this.spinMemory.mult(0.97);

    this.acc.add(this.spinMemory);

    // -----------------------------
    // ANTI-COLAPSO CENTRAL
    // -----------------------------
    // Si está demasiado cerca del centro, la empuja sutilmente hacia afuera
    let centerDist = this.pos.mag();
    if (centerDist < sphereRadius * 0.22) {
      let antiCenter = this.pos.copy().normalize().mult(0.06);
      this.acc.add(antiCenter);
    }

    // -----------------------------
    // INTEGRACIÓN
    // -----------------------------
    this.vel.add(this.acc);
    this.vel.mult(this.drag);
    this.vel.limit(this.maxSpeed * speedMult);
    this.pos.add(this.vel);
  }

  show(vol, alpha) {
    push();
    translate(this.pos.x, this.pos.y, this.pos.z);

    let col = lerpColor(this.baseColor, color(255, 100, 100), vol * 3);
    fill(red(col), green(col), blue(col), alpha);
    noStroke();

    let size = 1 + vol * 10;
    box(size);

    pop();
  }

  constrainToSphere(r) {
    let d = this.pos.mag();

    if (d > r) {
      let normal = this.pos.copy().normalize();

      // reposicionar
      this.pos = normal.copy().mult(r);

      // rebote
      let dot = this.vel.dot(normal);
      let reflection = p5.Vector.mult(normal, 2 * dot);
      this.vel.sub(reflection);

      // menos pérdida = más vida en la periferia
      this.vel.mult(0.92);

      // deslizamiento tangencial
      let tangent = p5.Vector.random3D().mult(0.04);
      this.vel.add(tangent);
    }
  }
}

// -----------------------------
// HELPERS
// -----------------------------
function randomPointInSphere(radius) {
  let v = p5.Vector.random3D();
  let m = pow(random(), 1 / 3) * radius;
  return v.mult(m);
}

// -----------------------------
// INTERACCIÓN
// -----------------------------
function mousePressed() {
  lastMouseX = mouseX;
  lastMouseY = mouseY;

  if (getAudioContext().state !== 'running') {
    getAudioContext().resume();
  }
}

function mouseDragged() {
  let dx = mouseX - lastMouseX;
  let dy = mouseY - lastMouseY;

  // rotación total libre
  rotY += dx * 0.01;
  rotX += dy * 0.01;

  lastMouseX = mouseX;
  lastMouseY = mouseY;
}

function touchStarted() {
  if (getAudioContext().state !== 'running') {
    getAudioContext().resume();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  sphereRadius = min(width, height) * 0.4;
}