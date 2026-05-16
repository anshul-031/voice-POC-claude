import LandingInteractions from '@/components/LandingInteractions';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const WEBSITE_NAME = process.env.NEXT_PUBLIC_WEBSITE_NAME || 'AnshulTheGreat.com';
const SUPPORT_PHONE_DISPLAY = '+91-9808494950';
const SUPPORT_PHONE_LINK = 'tel:+919808494950';
const SUPPORT_WHATSAPP_LINK = `https://wa.me/919808494950?text=${encodeURIComponent(
  "Hi, I'd like to learn more about your voice AI platform.",
)}`;

export default function LandingPage(): React.JSX.Element {
  const signupUrl = `${APP_URL}/signup`;
  const loginUrl = `${APP_URL}/login`;

  return (
    <>
      <LandingInteractions />

      {/* Navigation */}
      <nav className="landing-nav" id="landing-nav">
        <a href="/" className="nav-logo">
          <div className="nav-logo-icon">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <span className="nav-logo-text">{WEBSITE_NAME}</span>
        </a>
        <div className="nav-links">
          <a href="#solutions" className="nav-link-ghost">
            Solutions
          </a>
          <a href="#industries" className="nav-link-ghost">
            Industries
          </a>
          <a href="#features" className="nav-link-ghost">
            Features
          </a>
          <a href="#how-it-works" className="nav-link-ghost">
            How It Works
          </a>
          <a href={loginUrl} className="nav-link-ghost">
            Login
          </a>
          <a href={signupUrl} className="nav-link-primary">
            Get Started
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-particles">
          <div className="particle" style={{ left: '10%', top: '20%' }} />
          <div className="particle" style={{ left: '25%', top: '60%' }} />
          <div className="particle" style={{ left: '45%', top: '30%' }} />
          <div className="particle" style={{ left: '65%', top: '70%' }} />
          <div className="particle" style={{ left: '80%', top: '15%' }} />
          <div className="particle" style={{ left: '92%', top: '50%' }} />
        </div>

        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-dot" />
            Enterprise Voice AI &amp; Speech Analytics Platform
          </div>
          <h1>
            Intelligent <span className="gradient-text">Voice Agents</span>
            <br />
            for Every Enterprise
          </h1>
          <p className="hero-subtitle">
            Deploy AI-powered voice agents that automate conversations across
            sales, support, and operations — backed by advanced speech analytics
            that turn every call into actionable intelligence.
          </p>
          <div className="hero-actions">
            <a href={signupUrl} className="hero-btn hero-btn-primary">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
              Start Building Free
            </a>
            <a href="#solutions" className="hero-btn hero-btn-outline">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polygon
                  points="10 8 16 12 10 16 10 8"
                  fill="currentColor"
                />
              </svg>
              Explore Solutions
            </a>
          </div>
          <div className="hero-contact">
            <a href={SUPPORT_PHONE_LINK} className="contact-pill contact-pill-call">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.1.81.27 1.6.51 2.36a2 2 0 0 1-.45 2.11L8 9.5a16 16 0 0 0 6.5 6.5l1.31-1.17a2 2 0 0 1 2.11-.45c.76.24 1.55.41 2.36.51A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>{SUPPORT_PHONE_DISPLAY}</span>
            </a>
            <a
              href={SUPPORT_WHATSAPP_LINK}
              className="contact-pill contact-pill-whatsapp"
              target="_blank"
              rel="noreferrer"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M16.75 13.96c.25.12 1.47.72 1.7.81.23.09.38.13.55-.13.17-.25.7-.81.85-.98.16-.17.28-.25.42-.38.14-.13.17-.22.25-.37.08-.15.04-.28-.02-.39-.06-.12-.55-1.34-.76-1.84-.2-.5-.41-.43-.56-.44h-.48c-.16 0-.42.06-.64.3-.22.25-.84.82-.84 2s.86 2.33.98 2.49c.12.17 1.69 2.58 4.1 3.5.57.24 1.02.37 1.37.47.57.18 1.09.15 1.5.09.46-.07 1.47-.6 1.67-1.18.2-.58.2-1.07.14-1.18-.06-.12-.21-.18-.45-.3-.24-.12-1.47-.72-1.7-.81-.23-.09-.38-.13-.55.13-.17.25-.7.81-.85.98-.16.17-.28.25-.42.38-.14.13-.17.22-.25.37-.08.15-.04.28.02.39.06.12.55 1.34.76 1.84.2.5.41.43.56.44h.48c.16 0 .42-.06.64-.3.22-.25.84-.82.84-2s-.86-2.33-.98-2.49c-.12-.17-1.69-2.58-4.1-3.5-.57-.24-1.02-.37-1.37-.47-.57-.18-1.09-.15-1.5-.09-.46.07-1.47.6-1.67 1.18-.2.58-.2 1.07-.14 1.18.06.12.21.18.45.3.24.12 1.47.72 1.7.81z" />
              </svg>
              <span>WhatsApp support</span>
            </a>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="stats-bar">
        <div className="stats-grid reveal">
          <div className="stat-item">
            <div className="stat-number">60%</div>
            <div className="stat-label">Cost Reduction</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">&lt;2s</div>
            <div className="stat-label">Average Response Time</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">24/7</div>
            <div className="stat-label">Always Available</div>
          </div>
          <div className="stat-item">
            <div className="stat-number">95%</div>
            <div className="stat-label">Customer Satisfaction</div>
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section className="landing-section" id="solutions">
        <div className="section-header reveal">
          <span className="section-tag">Solutions</span>
          <h2>Two Powerful Products, One Platform</h2>
          <p>
            Combine conversational Voice AI agents with deep speech analytics to
            automate interactions and unlock insights from every conversation.
          </p>
        </div>

        <div className="solutions-grid">
          <div className="solution-card reveal">
            <div className="solution-icon voice-ai">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <div className="solution-label">Product 1</div>
            <h3>Voice AI Agents</h3>
            <p>
              Deploy intelligent conversational agents that handle real-time
              voice interactions across sales, support, collections, and
              operations — at any scale.
            </p>
            <ul className="solution-features">
              <li>Outbound sales &amp; lead qualification</li>
              <li>Inbound customer support &amp; FAQs</li>
              <li>Appointment scheduling &amp; reminders</li>
              <li>Payment collections &amp; follow-ups</li>
              <li>Employee helpdesk &amp; HR automation</li>
              <li>Order management &amp; status tracking</li>
            </ul>
            <a href={signupUrl} className="solution-cta">
              Build Your Agent
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          <div className="solution-card reveal">
            <div className="solution-icon speech-analytics">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div className="solution-label">Product 2</div>
            <h3>AI Speech Analytics</h3>
            <p>
              Transform every conversation into actionable insights with
              real-time and post-call analytics — sentiment tracking, compliance
              monitoring, and agent coaching.
            </p>
            <ul className="solution-features">
              <li>Real-time sentiment &amp; emotion analysis</li>
              <li>Compliance &amp; script adherence monitoring</li>
              <li>Agent performance scoring &amp; coaching</li>
              <li>Topic &amp; intent detection</li>
              <li>Automated call summarization</li>
              <li>Keyword &amp; phrase spotting</li>
            </ul>
            <a href={signupUrl} className="solution-cta">
              Explore Analytics
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="landing-section" id="industries">
        <div className="section-header reveal">
          <span className="section-tag">Industries</span>
          <h2>Built for Every Industry</h2>
          <p>
            Our platform adapts to the unique requirements of your industry —
            from regulatory compliance to domain-specific workflows.
          </p>
        </div>

        <div className="industries-grid">
          <div className="industry-card reveal">
            <div className="industry-icon banking">🏦</div>
            <h3>Banking &amp; Finance</h3>
            <p>
              Automate account inquiries, loan processing, and fraud detection
              with compliant voice agents.
            </p>
          </div>
          <div className="industry-card reveal">
            <div className="industry-icon healthcare">🏥</div>
            <h3>Healthcare</h3>
            <p>
              Streamline patient scheduling, prescription refills, and post-care
              follow-ups at scale.
            </p>
          </div>
          <div className="industry-card reveal">
            <div className="industry-icon retail">🛒</div>
            <h3>Retail &amp; E-commerce</h3>
            <p>
              Handle order tracking, returns, product recommendations, and
              customer loyalty programs.
            </p>
          </div>
          <div className="industry-card reveal">
            <div className="industry-icon telecom">📡</div>
            <h3>Telecom</h3>
            <p>
              Manage plan upgrades, outage notifications, billing inquiries, and
              tech support calls.
            </p>
          </div>
          <div className="industry-card reveal">
            <div className="industry-icon manufacturing">🏭</div>
            <h3>Manufacturing</h3>
            <p>
              Coordinate supply chain updates, vendor communications, and
              workforce management calls.
            </p>
          </div>
          <div className="industry-card reveal">
            <div className="industry-icon education">🎓</div>
            <h3>Education</h3>
            <p>
              Automate admissions inquiries, enrollment support, and student
              services across campuses.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section" id="features">
        <div className="section-header reveal">
          <span className="section-tag">Platform Features</span>
          <h2>Enterprise-Grade Voice AI</h2>
          <p>
            Everything you need to build, deploy, and scale AI voice agents for
            any enterprise.
          </p>
        </div>

        <div className="features-grid">
          <div className="feature-card reveal">
            <div className="feature-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </div>
            <div className="feature-text">
              <h3>Real-time Voice Conversation</h3>
              <p>
                Natural, human-like voice interactions powered by Gemini Live
                API with ultra-low latency streaming.
              </p>
            </div>
          </div>

          <div className="feature-card reveal">
            <div className="feature-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="feature-text">
              <h3>Compliance Ready</h3>
              <p>
                Built-in guardrails for PCI DSS, HIPAA, GDPR, and
                industry-specific regulatory requirements.
              </p>
            </div>
          </div>

          <div className="feature-card reveal">
            <div className="feature-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <div className="feature-text">
              <h3>Multi-language Support</h3>
              <p>
                Serve customers in 40+ languages with automatic detection and
                seamless language switching.
              </p>
            </div>
          </div>

          <div className="feature-card reveal">
            <div className="feature-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div className="feature-text">
              <h3>Live Transcription &amp; Analytics</h3>
              <p>
                Real-time call transcription with sentiment analysis and
                conversation analytics dashboard.
              </p>
            </div>
          </div>

          <div className="feature-card reveal">
            <div className="feature-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="feature-text">
              <h3>Custom Personalities</h3>
              <p>
                Design unique agent personas with custom system prompts, voices,
                and behavioral patterns.
              </p>
            </div>
          </div>

          <div className="feature-card reveal">
            <div className="feature-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div className="feature-text">
              <h3>Browser-Based Testing</h3>
              <p>
                Test your voice agents instantly in the browser — no phone
                system or hardware needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="landing-section" id="how-it-works">
        <div className="section-header reveal">
          <span className="section-tag">How It Works</span>
          <h2>Three Steps to Deploy</h2>
          <p>
            Go from zero to a production-ready voice agent in minutes, not
            months.
          </p>
        </div>

        <div className="steps-grid reveal">
          <div className="step-card">
            <div className="step-number">1</div>
            <h3>Create Your Agent</h3>
            <p>
              Define your agent&apos;s name, personality, and the voice that
              best represents your brand.
            </p>
          </div>
          <div className="step-card">
            <div className="step-number">2</div>
            <h3>Configure &amp; Train</h3>
            <p>
              Write a system prompt with your business logic, compliance rules,
              and conversation flows.
            </p>
          </div>
          <div className="step-card">
            <div className="step-number">3</div>
            <h3>Test &amp; Deploy</h3>
            <p>
              Test with a live call in your browser, then share the agent link
              with your team or customers.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-box reveal">
          <h2>Ready to Transform Your Customer Experience?</h2>
          <p>
            Join leading enterprises using {WEBSITE_NAME} to automate voice
            interactions and unlock conversation intelligence.
          </p>
          <div className="hero-actions">
            <a href={signupUrl} className="hero-btn hero-btn-primary">
              Get Started Free
            </a>
            <a href="#solutions" className="hero-btn hero-btn-outline">
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="footer-brand-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              </svg>
            </div>
            <span>{WEBSITE_NAME}</span>
          </div>
          <div className="footer-links">
            <a href="#solutions">Solutions</a>
            <a href="#industries">Industries</a>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href={loginUrl}>Login</a>
            <a href={SUPPORT_PHONE_LINK}>{SUPPORT_PHONE_DISPLAY}</a>
            <a href={SUPPORT_WHATSAPP_LINK} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </div>
          <div className="footer-copy">
            &copy; 2026 {WEBSITE_NAME}. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}
