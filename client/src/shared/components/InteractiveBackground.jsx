import { useEffect, useRef } from 'react';

export default function InteractiveBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationFrameId;
    let particles = [];

    // Config
    const PARTICLE_COUNT = 80;
    const CONNECT_DISTANCE = 150;
    const MOUSE_CONNECT_DISTANCE = 200;
    // We use a subtle white/accent color for the lines to match the tech theme
    const THEME_COLOR_RGB = '255, 255, 255';
    const ACCENT_COLOR_RGB = '16, 185, 129'; // emerald-500

    let mouse = { x: null, y: null };
    let width = window.innerWidth / 2; // For split screen
    let height = window.innerHeight;

    const resize = () => {
      width = canvas.parentElement.clientWidth;
      height = canvas.parentElement.clientHeight;
      canvas.width = width;
      canvas.height = height;
    };

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 1;
        this.vy = (Math.random() - 0.5) * 1;
        this.radius = Math.random() * 2 + 1;
      }

      update() {
        if (this.x < 0 || this.x > width) this.vx = -this.vx;
        if (this.y < 0 || this.y > height) this.vy = -this.vy;

        this.x += this.vx;
        this.y += this.vy;
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${THEME_COLOR_RGB}, 0.5)`;
        ctx.fill();
      }
    }

    const init = () => {
      resize();
      particles = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();

        // Connect particles to each other
        for (let j = i; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < CONNECT_DISTANCE) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            const opacity = 1 - distance / CONNECT_DISTANCE;
            ctx.strokeStyle = `rgba(${THEME_COLOR_RGB}, ${opacity * 0.15})`;
            ctx.stroke();
          }
        }

        // Connect particles to mouse
        if (mouse.x != null && mouse.y != null) {
          const dx = particles[i].x - mouse.x;
          const dy = particles[i].y - mouse.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < MOUSE_CONNECT_DISTANCE) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(mouse.x, mouse.y);
            const opacity = 1 - distance / MOUSE_CONNECT_DISTANCE;
            ctx.strokeStyle = `rgba(${ACCENT_COLOR_RGB}, ${opacity * 0.6})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.lineWidth = 1; // reset
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    const onMouseMove = e => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const onMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    window.addEventListener('resize', resize);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    init();
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0 bg-panel overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full pointer-events-auto" />
    </div>
  );
}
