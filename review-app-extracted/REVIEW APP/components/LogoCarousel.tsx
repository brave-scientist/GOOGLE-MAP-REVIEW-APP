'use client'

const logos = [
  { name: "Mama Rosa's Kitchen", icon: "🍕", color: "#C0392B", bg: "#FDF0EE" },
  { name: "Glow Studio", icon: "✦", color: "#7C3AED", bg: "#F3F0FF" },
  { name: "SmileCare Dental", icon: "◎", color: "#2563EB", bg: "#EFF6FF" },
  { name: "ProFix Plumbing", icon: "⬡", color: "#D97706", bg: "#FFFBEB" },
  { name: "The Corner Shelf", icon: "▣", color: "#0D9488", bg: "#F0FDFA" },
  { name: "Iron & Oak BBQ", icon: "◈", color: "#92400E", bg: "#FEF3C7" },
  { name: "LuxCuts Barber", icon: "◆", color: "#1C1917", bg: "#F5F0E8" },
  { name: "PawsFirst Vet", icon: "❋", color: "#065F46", bg: "#ECFDF5" },
]

export default function LogoCarousel() {
  // Duplicate the array for seamless loop
  const allLogos = [...logos, ...logos]

  return (
    <div className="py-10">
      {/* PLACEHOLDER: Replace with real business logos after beta */}
      <div className="carousel-wrapper">
        <div className="carousel-track">
          {allLogos.map((logo, i) => (
            <div
              key={i}
              className="card-hover flex items-center gap-2.5 rounded-xl px-5 py-3 whitespace-nowrap"
              style={{
                background: logo.bg,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                minWidth: 'fit-content',
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: logo.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 14,
                }}
              >
                {logo.icon}
              </span>
              <span
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  color: '#1a1a2e',
                }}
              >
                {logo.name}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-cream-dim">
        Trusted by single-location businesses across restaurants, salons, clinics, and more.
      </p>
    </div>
  )
}