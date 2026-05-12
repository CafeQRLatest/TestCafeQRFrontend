import Link from 'next/link'
import Image from 'next/image'
import Head from 'next/head'
import { useAuth } from '../context/AuthContext';
import { useRouter } from 'next/router';
import { 
  FiMonitor, 
  FiSmartphone, 
  FiLayout, 
  FiBarChart2 
} from 'react-icons/fi'

export default function Home() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  return (
    <>
    <Head>
        <title>Cafe QR | The Modern POS Ecosystem</title>
    </Head>
    <div className="landing-page" style={{ backgroundColor: '#f8fafc' }}>
      {/* Background Ambience */}
      <div className="ambient-light orange" />
      <div className="ambient-light green" />
      <div className="mesh-grid" />

      {/* Hero Section */}
      <main className="hero">
        <div className="hero-content">
          <div className="hero-text">
            {/* Integrated Header/Logo Area */}
            <div className="hero-header">
              <div className="logo-section">
                <Image src="/cafeqr-logo.svg" alt="Cafe QR" width={48} height={48} priority />
                <span className="logo-text">Cafe QR</span>
              </div>
            </div>
            <div className="hero-badge">
              <span className="badge-dot"></span>
              The #1 Choice for Modern Restaurants
            </div>
            
            <h1 className="hero-title">
              Manage Your Restaurant<br />
              <span className="gradient-text">Anywhere, Anytime.</span>
            </h1>
            
            <p className="hero-sub">
              A complete POS ecosystem that works on <strong>Web & App</strong>. 
              Take orders, manage tables, and track sales from any device.
              <span className="highlight"> Seamless. Powerful. Elegant.</span>
            </p>
            
            <div className="cta-group">
              <button onClick={() => router.push(isAuthenticated ? '/owner/main-menu' : '/login')} className="large-hero-btn" style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span>Start Now</span>
                <span className="arrow">→</span>
              </button>
            </div>

            <div className="feature-checklist">
              <div className="check-item"><span className="check">✓</span> Unlimited Orders</div>
              <div className="check-item"><span className="check">✓</span> QR Code Menus</div>
              <div className="check-item"><span className="check">✓</span> Owner Dashboard</div>
              <div className="check-item"><span className="check">✓</span> Kitchen Display</div>
              <div className="check-item"><span className="check">✓</span> Customer Ordering</div>
              <div className="check-item"><span className="check">✓</span> Invoice Management</div>
            </div>
          </div>

          {/* 3D Visual Section with Counter Sale UI */}
          <div className="hero-visual">
            <div className="phone-container">
              <div className="phone-3d">
                <div className="phone-screen">
                  {/* Simulated Counter Sale UI */}
                  <div className="pos-header">
                    <div className="pos-title">Counter Sale</div>
                    <div className="pos-actions">
                      <div className="pos-btn-icon">⚡</div>
                      <div className="pos-btn-icon">⚙️</div>
                    </div>
                  </div>
                  
                  {/* Search Bar Simulation */}
                  <div className="pos-search">
                    <span className="search-icon">🔍</span>
                    <div className="search-placeholder">Search menu items...</div>
                  </div>

                  {/* Categories */}
                  <div className="pos-cats">
                    <div className="pos-cat active">All</div>
                    <div className="pos-cat">Burger</div>
                    <div className="pos-cat">Pizza</div>
                    <div className="pos-cat">Coffee</div>
                  </div>

                  {/* Items Grid */}
                  <div className="pos-grid">
                    <div className="pos-card">
                      <div className="pos-img">
                         <img src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=300&q=80" alt="Burger" />
                      </div>
                      <div className="pos-info">
                        <div className="pos-name">Cheese Burger</div>
                        <div className="pos-price">₹149</div>
                      </div>
                    </div>
                    <div className="pos-card">
                      <div className="pos-img">
                         <img src="https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=300&q=80" alt="Pizza" />
                      </div>
                      <div className="pos-info">
                        <div className="pos-name">Margherita</div>
                        <div className="pos-price">₹299</div>
                      </div>
                    </div>
                    <div className="pos-card">
                      <div className="pos-img">
                         <img src="https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=300&q=80" alt="Latte" />
                      </div>
                      <div className="pos-info">
                        <div className="pos-name">Latte</div>
                        <div className="pos-price">₹120</div>
                      </div>
                    </div>
                    <div className="pos-card">
                      <div className="pos-img">
                         <img src="https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?auto=format&fit=crop&w=300&q=80" alt="Fries" />
                      </div>
                      <div className="pos-info">
                        <div className="pos-name">Fries</div>
                        <div className="pos-price">₹89</div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Cart Bar */}
                  <div className="pos-cart-bar">
                    <div className="cart-summary">
                      <span className="item-count">2 Items</span>
                      <span className="cart-total">₹448.00</span>
                    </div>
                    <div className="checkout-btn">Place Order ›</div>
                  </div>
                </div>
                <div className="phone-shine" />
              </div>
              
              {/* Floating Elements */}
              <div className="float-card card-1">
                <span className="float-icon">📈</span>
                <div>
                  <strong>Live Analytics</strong>
                  <p>Sales up by 24%</p>
                </div>
              </div>
              <div className="float-card card-2">
                <span className="float-icon">🔔</span>
                <div>
                  <strong>Kitchen Display</strong>
                  <p>New Order #1024</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Features Grid */}
      <section className="features">
        <div className="section-header">
          <h2>Everything you need to run a modern restaurant</h2>
          <p>Powerful features packed into a simple, elegant interface.</p>
        </div>
        
        <div className="features-grid">
          <div className="feature-card">
            <div className="icon-box gradient-1">
              <FiMonitor size={28} style={{ strokeWidth: 2.5 }} />
            </div>
            <h3>POS & Billing</h3>
            <p>Fast, reliable billing for dine-in, takeaway, and delivery. Works offline.</p>
          </div>
          <div className="feature-card">
            <div className="icon-box gradient-2">
              <FiSmartphone size={28} style={{ strokeWidth: 2.5 }} />
            </div>
            <h3>Digital Menu</h3>
            <p>Scanning QR code opens a beautiful, interactive menu for customers.</p>
          </div>
          <div className="feature-card">
            <div className="icon-box gradient-3">
              <FiLayout size={28} style={{ strokeWidth: 2.5 }} />
            </div>
            <h3>Kitchen Display</h3>
            <p>Send orders directly to the kitchen screen. Paperless and efficient.</p>
          </div>
          <div className="feature-card">
            <div className="icon-box gradient-4">
              <FiBarChart2 size={28} style={{ strokeWidth: 2.5 }} />
            </div>
            <h3>Reports & Analytics</h3>
            <p>Track sales, best-selling items, and staff performance in real-time.</p>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="bottom-cta">
        <div className="bottom-cta-content">
          <h2>Ready to transform your restaurant?</h2>
          <p>Join thousands of restaurants using Cafe QR today.</p>
          <button onClick={() => router.push(isAuthenticated ? '/owner/main-menu' : '/login')} className="large-hero-btn" style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span>Start Now</span>
            <span className="arrow">→</span>
          </button>
        </div>
      </section>

      <style jsx>{`
        /* --- Layout & Global --- */
        :global(html),
        :global(body),
        :global(#__next) {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100%;
          overflow-x: clip !important;
          overflow-y: auto !important;
          background: #f8fafc !important; /* Light BG */
          font-family: 'Plus Jakarta Sans', 'Inter', sans-serif;
        }

        .landing-page {
          min-height: 100dvh;
          width: 100%;
          position: relative;
          display: flex;
          flex-direction: column;
          color: #1e293b; /* Dark Text */
          overflow-y: auto; /* The ONE valid scrollbar */
          overflow-x: clip;
          -webkit-overflow-scrolling: touch; /* Smooth iOS scroll */
        }

        .ambient-light {
          position: absolute;
          width: clamp(280px, 62vw, 800px);
          height: clamp(280px, 62vw, 800px);
          border-radius: 50%;
          filter: blur(140px);
          opacity: 0.15;
          z-index: 0;
          pointer-events: none;
          animation: pulse 12s ease-in-out infinite;
        }
        .orange { top: -300px; right: -200px; background: #ea580c; }
        .green { bottom: -300px; left: -200px; background: #15803d; animation-delay: -6s; }

        .mesh-grid {
          position: fixed;
          inset: 0;
          background-image: 
            linear-gradient(rgba(0, 0, 0, 0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(circle at 50% 50%, black 40%, transparent 100%);
          z-index: 0;
          pointer-events: none;
        }

        /* --- Hero Header (Logo) --- */
        .hero-header {
          margin-bottom: 20px;
          position: relative;
          z-index: 10;
        }
        .logo-section { 
          display: inline-flex; 
          align-items: center; 
          gap: 16px; 
          font-weight: 800; 
          font-size: 28px; 
          letter-spacing: -1px;
          color: white;
        }
        .logo-text { 
          color: #0f172a; 
        }

        /* --- Hero --- */
        .hero {
          position: relative;
          z-index: 1;
          min-height: 100dvh;
          width: 100%;
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: center;
          padding: clamp(28px, 5vw, 40px) clamp(16px, 3vw, 32px) clamp(72px, 8vw, 120px);
          box-sizing: border-box;
          gap: 40px;
        }

        .hero-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 80px;
          margin: auto 0; /* Safe centering (centers if space, scrolls if not) */
        }

        .hero-text { flex: 1; z-index: 2; max-width: 650px; }
        
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(17, 94, 89, 0.08); /* Green tint */
          border: 1px solid rgba(17, 94, 89, 0.15);
          padding: 8px 16px;
          border-radius: 100px;
          color: #115e59; /* Green text */
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 20px;
          backdrop-filter: blur(10px);
        }
        .badge-dot { width: 6px; height: 6px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 10px #22c55e; }

        .hero-title {
          font-size: clamp(38px, 6vw, 64px);
          line-height: 1.1;
          font-weight: 800;
          margin-bottom: 24px;
          letter-spacing: -2.5px;
          color: #0f172a;
          text-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .gradient-text {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 50%, #db2777 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        .hero-sub {
          font-size: 16px;
          color: #64748b;
          margin-bottom: 24px;
          line-height: 1.5;
          max-width: 500px;
        }
        .hero-sub strong { color: #0f172a; }
        .highlight { color: #115e59; font-weight: 600; }

        .cta-group { display: flex; gap: 16px; margin-bottom: 24px; }
        .cta-btn {
          display: flex; align-items: center; gap: 12px;
          padding: 16px 32px; border-radius: 16px;
          font-weight: 600; font-size: 16px;
          cursor: pointer; text-decoration: none;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cta-btn.primary {
          background: white; color: #0f172a; border: none;
          box-shadow: 0 10px 25px -5px rgba(255, 255, 255, 0.2);
        }
        .cta-btn.primary:hover { transform: translateY(-2px); box-shadow: 0 20px 30px -10px rgba(255, 255, 255, 0.3); }
        
        .large-hero-btn {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 22px 64px;
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important;
          border-radius: 99px;
          color: white !important;
          font-size: 20px;
          font-weight: 700;
          text-decoration: none;
          box-shadow: 
             0 20px 40px -10px rgba(249, 115, 22, 0.5),
              inset 0 1px 0 rgba(255,255,255,0.2);
          transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
          border: 1px solid rgba(0,0,0,0.05);
          position: relative;
          overflow: hidden;
          animation: float-btn 6s ease-in-out infinite;
        }
        .large-hero-btn::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(to right, transparent, rgba(255,255,255,0.2), transparent);
          transform: skewX(-20deg) translateX(-150%);
          transition: transform 0.5s;
        }
        .large-hero-btn:hover {
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 30px 60px -15px rgba(249, 115, 22, 0.6);
          animation-play-state: paused;
        }
        .large-hero-btn:hover::after {
           transform: skewX(-20deg) translateX(150%);
        }
        
        .arrow { font-size: 1.1em; transition: transform 0.2s; }
        .large-hero-btn:hover .arrow { transform: translateX(8px); }

        @keyframes float-btn {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .feature-checklist {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-top: 32px;
          transform: translateZ(0);
        }
        .check-item {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 15px;
          color: #0f172a; /* Darkest Navy for max contrast */
          font-weight: 700;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          padding: 4px 8px;
          border-radius: 8px;
        }
        .check-item:hover {
           transform: translateX(4px);
           background: rgba(249, 115, 22, 0.08);
           color: #ea580c;
        }
        .check {
          color: #fff;
          font-weight: 800;
          font-size: 14px;
          width: 24px; height: 24px;
          background: #f97316;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 5px rgba(249, 115, 22, 0.4);
        }

        /* --- 3D Phone Visual (Simulated POS) --- */
        .hero-visual {
          flex: 1;
          display: flex;
          justify-content: center;
          perspective: 1500px;
          position: relative;
        }
        .phone-container {
          position: relative;
          width: min(320px, calc(100vw - 48px));
          height: min(650px, calc(100dvh - 96px));
          min-height: 520px;
          transform-style: preserve-3d;
          animation: float 8s ease-in-out infinite;
        }
        .phone-3d {
          position: absolute; inset: 0;
          background: #0f172a; /* Dark Frame */
          border-radius: 44px;
          border: 10px solid #1e293b; /* Bezel */
          box-shadow: 
            0 50px 100px -20px rgba(0, 0, 0, 0.5),
            inset 0 0 0 2px rgba(255,255,255,0.1);
          overflow: hidden;
          transform-style: preserve-3d;
        }
        .phone-screen {
          background: #18181b; /* Dark Screen */
          height: 100%; width: 100%;
          padding: 20px; display: flex; flex-direction: column; gap: 16px;
        }
        
        /* Simulated POS UI */
        .pos-header { display: flex; justify-content: space-between; align-items: center; padding-top: 10px; margin-bottom: 4px; }
        .pos-title { font-weight: 700; font-size: 18px; color: white; }
        .pos-actions { display: flex; gap: 12px; }
        .pos-btn-icon { width: 32px; height: 32px; background: rgba(255,255,255,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; color: white; }
        
        .pos-search {
          background: #27272a; padding: 12px 16px; border-radius: 12px;
          display: flex; align-items: center; gap: 10px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .search-icon { font-size: 14px; opacity: 0.5; color: #a1a1aa; }
        .search-placeholder { font-size: 13px; color: #a1a1aa; }
        
        .pos-cats { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .pos-cats::-webkit-scrollbar { display: none; }
        .pos-cat { padding: 6px 14px; border-radius: 20px; background: #27272a; color: #a1a1aa; font-size: 12px; font-weight: 500; white-space: nowrap; }
        .pos-cat.active { background: #f97316; color: white; box-shadow: 0 4px 10px rgba(249, 115, 22, 0.2); }
        
        .pos-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; flex: 1; overflow: hidden; }
        .pos-card {
          background: #27272a; border-radius: 16px; padding: 12px;
          display: flex; flex-direction: column; gap: 8px;
          border: 1px solid rgba(255,255,255,0.05);
          box-shadow: none;
        }
        .pos-img {
          height: 80px; 
          background: #3f3f46; 
          border-radius: 10px;
          overflow: hidden;
          display: block; 
        }
        .pos-img img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }
        .pos-info { display: flex; flex-direction: column; gap: 4px; }
        .pos-name { font-size: 12px; font-weight: 600; color: #e4e4e7; }
        .pos-price { font-size: 11px; color: #f97316; font-weight: 700; }
        
        .pos-cart-bar {
          background: #f97316; border-radius: 16px; padding: 16px;
          display: flex; justify-content: space-between; align-items: center;
          margin-top: auto; box-shadow: 0 10px 20px rgba(249, 115, 22, 0.2);
        }
        .cart-summary { display: flex; flex-direction: column; }
        .item-count { font-size: 10px; opacity: 0.9; font-weight: 500; }
        .cart-total { font-size: 14px; font-weight: 700; }
        .checkout-btn { font-size: 13px; font-weight: 600; }

        .phone-shine {
          position: absolute; top: 0; left: -100%; width: 50%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          transform: skewX(-20deg); pointer-events: none;
        }

        /* Float Cards (Dark Theme) */
        .float-card {
          position: absolute;
          background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(12px);
          padding: 14px 18px; border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.15);
          display: flex; align-items: center; gap: 14px;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
          transform: translateZ(40px);
        }
        .float-icon { font-size: 24px; padding: 8px; background: rgba(255,255,255,0.1); border-radius: 10px; color: white; }
        .float-card strong { display: block; font-size: 13px; margin-bottom: 2px; color: white; }
        .float-card p { margin: 0; font-size: 11px; color: #94a3b8; font-weight: 500; }
        .card-1 { top: 80px; left: -60px; animation: float-simple 6s ease-in-out infinite; }
        .card-2 { bottom: 100px; right: -60px; animation: float-simple 7s ease-in-out infinite reverse; }

        /* --- Features Section --- */
        .features {
          width: 100%; max-width: 1400px; margin: 0 auto;
          padding: 100px 32px; position: relative; z-index: 2;
        }
        .section-header { text-align: center; max-width: 700px; margin: 0 auto 80px; }
        .section-header h2 { font-size: 42px; font-weight: 800; margin-bottom: 16px; letter-spacing: -1px; }
        .section-header p { font-size: 18px; color: #94a3b8; line-height: 1.6; }
        
        .features-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px;
        }
        .feature-card {
          background: white;
          border: 1px solid rgba(226, 232, 240, 0.8);
          padding: 32px 24px; border-radius: 24px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative; overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
        }
        .feature-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          border-color: rgba(226, 232, 240, 1);
        }
        .icon-box {
          width: 56px; height: 56px; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          font-size: 26px; margin-bottom: 24px;
        }
        .gradient-1 { background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); color: #fff; box-shadow: 0 10px 20px -5px rgba(249, 115, 22, 0.4); }
        .gradient-2 { background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%); color: #fff; box-shadow: 0 10px 20px -5px rgba(99, 102, 241, 0.4); }
        .gradient-3 { background: linear-gradient(135deg, #10b981 0%, #34d399 100%); color: #fff; box-shadow: 0 10px 20px -5px rgba(16, 185, 129, 0.4); }
        .gradient-4 { background: linear-gradient(135deg, #ec4899 0%, #f472b6 100%); color: #fff; box-shadow: 0 10px 20px -5px rgba(236, 72, 153, 0.4); }

        .feature-card h3 { font-size: 18px; margin: 0 0 12px 0; font-weight: 700; color: #0f172a; }
        .feature-card p { margin: 0; color: #475569; line-height: 1.6; font-size: 15px; }

        /* Mobile Responsive */
        @media (max-width: 1100px) {
          .nav-content { padding: 0 20px; }
          .hero { 
            flex-direction: column; 
            padding: 40px 20px; 
            gap: 60px; 
            text-align: center;
            justify-content: flex-start;
            min-height: auto;
          }
          .hero-content {
             flex-direction: column;
             gap: 40px;
          }
          .hero-text { margin: 0 auto; width: 100%; max-width: 600px; }
          .hero-title { font-size: 48px; }
          .hero-sub { margin: 0 auto 32px; font-size: 16px; }
          .hero-header { margin-bottom: 32px; justify-content: center; display: flex; }
          .hero-badge { margin: 0 auto 24px; }
          
          .cta-group { justify-content: flex-start; align-items: flex-start; flex-direction: column; width: 100%; max-width: 400px; margin: 0 0 40px; }
          .cta-btn { justify-content: center; width: 100%; box-sizing: border-box; }
          
          .feature-checklist { 
            grid-template-columns: repeat(2, 1fr); 
            text-align: left; 
            width: fit-content;
            max-width: 100%; 
            margin: 30px 0 0; 
          }
          
          .phone-container { 
            width: min(300px, calc(100vw - 48px));
            height: min(600px, calc(100dvh - 96px));
            min-height: 500px;
            transform: scale(0.9);
            margin: 0 auto;
          }
          
          .features { padding: 60px 20px; }
          .features-grid { grid-template-columns: repeat(2, 1fr); }
        }
        
        @media (max-width: 600px) {
          .hero-title { font-size: 38px; }
          .features-grid { grid-template-columns: 1fr; }
          .feature-checklist { grid-template-columns: 1fr; }
          .bottom-cta h2 { font-size: 28px; }
          
          .large-hero-btn { 
            padding: 20px 48px; 
            font-size: 20px; 
            width: 100%; 
            max-width: 300px;
            justify-content: center;
          }
        }
        
        @media (max-width: 480px) {
          .hero { padding: 32px 16px 56px; gap: 30px; }
          .hero-title { font-size: clamp(34px, 11vw, 40px); margin-bottom: 16px; letter-spacing: -1px; }
          .hero-sub { font-size: 16px; margin-bottom: 32px; }
          .large-hero-btn { padding: 16px 32px; font-size: 18px; }
          
          .hero-visual { display: none !important; }
          
          .feature-checklist { 
            grid-template-columns: 1fr; 
            gap: 12px; 
            margin-top: 0; 
            background: rgba(255,255,255,0.03);
            padding: 20px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.05);
          }
          .cta-group { margin-bottom: 32px; }
        }

        /* --- Bottom CTA --- */
        .bottom-cta {
          padding: 100px 32px;
          text-align: center;
          position: relative;
          z-index: 2;
          background: linear-gradient(180deg, rgba(255,255,255,0) 0%, #f1f5f9 100%);
        }
        .bottom-cta-content {
          max-width: 600px;
          margin: 0 auto;
          background: white;
          border: 1px solid #e2e8f0;
          padding: 60px 40px;
          border-radius: 32px;
          box-shadow: 0 40px 80px -20px rgba(0,0,0,0.08);
        }
        .bottom-cta h2 { font-size: 36px; font-weight: 800; margin-bottom: 16px; letter-spacing: -1px; color: #0f172a; }
        .bottom-cta p { font-size: 18px; color: #64748b; margin-bottom: 40px; }
        
        @keyframes float { 0%, 100% { transform: translateY(0) rotateX(5deg) rotateY(-5deg); } 50% { transform: translateY(-20px) rotateX(8deg) rotateY(0deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.12; transform: scale(1); } 50% { opacity: 0.2; transform: scale(1.1); } }
        @keyframes float-simple { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>
    </div>
    </>
  )
}
