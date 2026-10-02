export default function InteractiveFeatureCard({ title, description, icon: Icon, colorClass }) {
  return (
    <div className="w-full relative py-2 group">
      <div className="relative p-5 rounded-xl bg-surface border border-border/60 transition-all duration-300 ease-out overflow-hidden cursor-default hover:-translate-y-1 hover:shadow-lg hover:border-border">
        {/* Subtle background glow on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-text/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        <div className="relative z-10 flex gap-4 items-start">
          <div
            className={`w-12 h-12 rounded-lg bg-panel flex items-center justify-center shrink-0 border border-border/50 transition-all duration-300 group-hover:scale-105 ${colorClass}`}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-medium mb-1 text-lg text-text/90 group-hover:text-text transition-colors duration-300">
              {title}
            </h3>
            <p className="text-sm text-muted leading-relaxed group-hover:text-muted/90 transition-colors duration-300">
              {description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
