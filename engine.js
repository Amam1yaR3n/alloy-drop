export const TAU = Math.PI * 2;
export const GAP = 154;
export const mod = a => ((a % TAU) + TAU) % TAU;
export const gapWidth = () => 30 * Math.PI / 180;
export const inGap = (ring, rotation) => Math.abs(Math.atan2(Math.sin(Math.PI / 2 - ring.angle - rotation), Math.cos(Math.PI / 2 - ring.angle - rotation))) < gapWidth(ring.n) / 2;
export const tiltSpeed = tilt => Math.sign(tilt) * Math.min(1, Math.max(0, Math.abs(tilt) - 3) / 22) * 120 * Math.PI / 180;
export function screenTilt(beta, gamma, angle) {
  const a = angle * Math.PI / 180;
  return gamma * Math.cos(a) + beta * Math.sin(a);
}
export class Game {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() {
    this.rotation = 0; this.score = 0; this.next = 1; this.ball = -65; this.velocity = 0; this.camera = 0; this.impact = 0; this.impactY = 0; this.rings = []; this.particles = []; this.ensure();
  }
  ensure() {
    while (this.next <= this.score + 6) {
      this.rings.push({ n: this.next, y: (this.next - 1) * GAP, angle: this.random() * TAU }); this.next++;
    }
    this.rings = this.rings.filter(r => r.n >= this.score - 2);
  }
  step(dt, speed = 0) {
    this.rotation = mod(this.rotation + speed * dt);
    const old = this.ball;
    this.velocity = Math.min(720, this.velocity + 1050 * dt); this.ball += this.velocity * dt;
    for (const r of this.rings) {
      if (r.n <= this.score || old > r.y || this.ball < r.y || this.velocity <= 0) continue;
      if (inGap(r, this.rotation)) {
        this.score = r.n;
        for (let i = 0; i < 10; i++) this.particles.push({x:0,y:r.y,vx:(this.random()-.5)*150,vy:-this.random()*100,life:.65});
      } else { this.ball = r.y; this.velocity = -340; this.impact = 1; this.impactY = r.y; break; }
    }
    this.impact = Math.max(0, this.impact - dt * 9);
    this.camera += (this.score * GAP - this.camera) * (1 - Math.exp(-5 * dt));
    this.particles.forEach(p => {p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;p.life-=dt;});
    this.particles = this.particles.filter(p=>p.life>0);
    this.ensure();
  }
}
