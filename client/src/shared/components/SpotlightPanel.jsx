import { useRef, useState } from 'react';

export default function SpotlightPanel({ children, className = '' }) {
  const panelRef = useRef(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = e => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={panelRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden ${className}`}
    >
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700 ease-out z-0"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `
            radial-gradient(400px circle at ${position.x}px ${position.y}px, rgba(99, 102, 241, 0.15), transparent 60%),
            radial-gradient(800px circle at ${position.x}px ${position.y}px, rgba(59, 130, 246, 0.08), transparent 50%)
          `,
        }}
      />
      {children}
    </div>
  );
}
