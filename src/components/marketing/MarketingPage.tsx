import { useScanner } from '@/context/scanner-context'
import { Button } from '@/components/ui/button'

/* Static marketing page — the sample content the scanner inspects. The hero
   CTA is the only interactive element (toggles the scanner). */
export function MarketingPage() {
  const { isActive, toggle } = useScanner()

  return (
    <>
      <section id="hero" className="hero-section">
        <div className="hero-content">
          <span className="hero-badge">CSS Inspector Tool</span>
          <h1 className="hero-title">
            Inspect Any Element's
            <br />
            <span className="hero-highlight">CSS Instantly</span>
          </h1>
          <p className="hero-subtitle">
            Hover any element on this page to see its CSS rules, computed styles,
            box model, fonts, and colors — live, without DevTools.
          </p>
          <Button
            id="cta-btn"
            variant="ghost"
            className={'hero-cta' + (isActive ? ' scanner-active-state' : '')}
            onClick={toggle}
          >
            <span className="hero-cta-icon">{isActive ? '✓' : '⚡'}</span>
            {isActive
              ? 'Scanner Active — Click to Disable'
              : 'Try It Yourself On This Page'}
          </Button>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">5</span>
              <span className="hero-stat-label">Inspector Views</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">3</span>
              <span className="hero-stat-label">Copy Actions</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-value">5</span>
              <span className="hero-stat-label">Pseudo States</span>
            </div>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-code-preview">
            <div className="hcp-header">
              <span className="hcp-dot" />
              <span className="hcp-dot" />
              <span className="hcp-dot" />
            </div>
            <div className="hcp-line hcp-mq">@media (max-width: 768px) {'{'}</div>
            <div className="hcp-line hcp-selector" style={{ paddingLeft: 12 }}>
              .hero-section {'{'}
            </div>
            <div className="hcp-line hcp-prop" style={{ paddingLeft: 24 }}>
              <span className="hcp-key">padding:</span>{' '}
              <span className="hcp-val">80px 5% 160px;</span>
            </div>
            <div className="hcp-line hcp-close" style={{ paddingLeft: 12 }}>
              {'}'}
            </div>
            <div className="hcp-line hcp-close">{'}'}</div>
            <div className="hcp-line" style={{ marginTop: 6 }} />
            <div className="hcp-line hcp-selector">.hero-cta {'{'}</div>
            <div className="hcp-line hcp-prop hcp-highlight-line">
              <span className="hcp-key">background:</span>{' '}
              <span className="hcp-val">linear-gradient(…);</span>
            </div>
            <div className="hcp-line hcp-prop">
              <span className="hcp-key">border-radius:</span>{' '}
              <span className="hcp-val">10px;</span>
            </div>
            <div className="hcp-line hcp-prop">
              <span className="hcp-key">transition:</span>{' '}
              <span className="hcp-val">transform 0.2s;</span>
            </div>
            <div className="hcp-line hcp-close">{'}'}</div>
            <div className="hcp-line" style={{ marginTop: 6 }} />
            <div className="hcp-line hcp-selector">.hero-cta::after {'{'}</div>
            <div className="hcp-line hcp-prop">
              <span className="hcp-key">content:</span>{' '}
              <span className="hcp-val">"";</span>
            </div>
            <div className="hcp-line hcp-prop">
              <span className="hcp-key">animation:</span>{' '}
              <span className="hcp-val">shimmer 2.6s∞;</span>
            </div>
            <div className="hcp-line hcp-close">{'}'}</div>
            <div className="hcp-line" style={{ marginTop: 8 }} />
            <div className="hcp-line hcp-comment">/* Specificity: 0,1,0 */</div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-gray-50 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-bold tracking-widest text-indigo-500 uppercase mb-3 bg-indigo-50 px-4 py-1 rounded-full border border-indigo-100">
              How It Works
            </span>
            <h2 className="text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
              Inspect, copy, ship faster
            </h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
              Three steps to extract CSS from any element on this page — no
              DevTools, no extension.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-2xl mb-6 group-hover:bg-indigo-100 transition-colors">
                🎯
              </div>
              <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">
                Step 1
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Activate</h3>
              <p className="text-gray-500 leading-relaxed text-sm">
                Click the "Try It" button in the hero. A toolbar slides in at the
                top of the page signaling the scanner is live.
              </p>
            </div>
            <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-sm p-8 border border-indigo-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-2xl mb-6 group-hover:bg-blue-200 transition-colors">
                🖱️
              </div>
              <div className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">
                Step 2
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Hover</h3>
              <p className="text-gray-500 leading-relaxed text-sm">
                Move your mouse over any element. A cyan outline and a label
                showing tag, class, and dimensions follows your cursor.
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-8 border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center text-2xl mb-6 group-hover:bg-purple-100 transition-colors">
                📋
              </div>
              <div className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-2">
                Step 3
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Inspect</h3>
              <p className="text-gray-500 leading-relaxed text-sm">
                Click to pin the inspector panel. Browse CSS rules, computed
                styles, box model, fonts, and colors — then copy.
              </p>
            </div>
          </div>

          <div className="text-center mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-6">
              Everything you can extract
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              ['📄', 'CSS Rules', 'With specificity'],
              ['⚙️', 'Computed', 'Filtered styles'],
              ['📐', 'Dimensions', 'Box model'],
              ['🔤', 'Fonts', 'Live preview'],
              ['🎨', 'Colors', 'Swatches + hex'],
              ['💨', 'Tailwind', 'Auto-convert'],
            ].map(([icon, title, sub]) => (
              <div
                key={title}
                className="bg-white border border-gray-200 rounded-xl p-4 text-center hover:border-indigo-300 hover:shadow-md transition-all"
              >
                <div className="text-2xl mb-2">{icon}</div>
                <div className="text-xs font-bold text-gray-700">{title}</div>
                <div className="text-xs text-gray-400 mt-1">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="demo" className="demo-section">
        <h2 className="demo-section-title">Elements to Inspect</h2>
        <p className="demo-section-sub">
          Activate the scanner above and click any of these elements.
        </p>

        <div className="demo-grid">
          <div className="demo-card">
            <div className="demo-card-title">Typography</div>
            <h1 className="demo-heading-1">Heading 1</h1>
            <h2 className="demo-heading-2">Heading 2</h2>
            <h3 className="demo-heading-3">Heading 3</h3>
          </div>

          <div className="demo-card">
            <div className="demo-card-title">Blockquote</div>
            <blockquote className="demo-blockquote">
              "Inspect any element on the page and copy its CSS in one click.
              Design faster."
            </blockquote>
          </div>

          <div className="demo-card">
            <div className="demo-card-title">Form Input</div>
            <input className="demo-input" type="text" placeholder="Click me to inspect..." />
          </div>

          <div className="demo-card">
            <div className="demo-card-title">Styled Button</div>
            <button className="demo-btn">Hover &amp; Inspect Me</button>
          </div>

          <div className="demo-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="demo-card-title">Status Badges</div>
            <div>
              <span className="demo-badge demo-badge-green">Active</span>
              &nbsp;
              <span className="demo-badge demo-badge-blue">Pending</span>
              &nbsp;
              <span className="demo-badge demo-badge-red">Error</span>
            </div>
          </div>

          <div className="demo-card">
            <div className="demo-card-title">Data Table</div>
            <table className="demo-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>font-size</td>
                  <td>0.82rem</td>
                </tr>
                <tr>
                  <td>border</td>
                  <td>1px solid</td>
                </tr>
                <tr>
                  <td>padding</td>
                  <td>7px 10px</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="demo-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div className="demo-card-title">SVG Element</div>
            <svg width="64" height="64" viewBox="0 0 64 64" style={{ display: 'block' }}>
              <circle cx="32" cy="32" r="28" fill="#6366f1" opacity="0.15" stroke="#6366f1" strokeWidth="2" />
              <circle cx="32" cy="32" r="16" fill="#6366f1" opacity="0.6" />
              <circle cx="32" cy="32" r="6" fill="#fff" />
            </svg>
            <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>
              Try inspecting SVG elements
            </span>
          </div>

          <div
            className="demo-card"
            style={{
              background: 'linear-gradient(135deg,#667eea,#764ba2)',
              border: 'none',
              color: '#fff',
            }}
          >
            <div className="demo-card-title" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Gradient Background
            </div>
            <p style={{ fontSize: '0.85rem', lineHeight: 1.6, opacity: 0.85 }}>
              This card uses a CSS gradient background. Inspect it to see the
              gradient value in the Colors and Computed tabs.
            </p>
          </div>
        </div>
      </section>

      <footer
        style={{
          background: '#0d1117',
          color: '#718096',
          textAlign: 'center',
          padding: '32px 24px',
          fontSize: '0.8rem',
          borderTop: '1px solid #21262d',
        }}
      >
        CSS Scanner — Browser Prototype &nbsp;·&nbsp; Built with React + TypeScript +
        Tailwind CSS
      </footer>
    </>
  )
}
