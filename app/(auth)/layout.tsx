import './auth.css';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-layout">
      <div className="grid-bg" />
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-container">
        <div className="auth-logo">
          <h1>WeightUp</h1>
          <p>Track your gains. Dominate the leaderboard.</p>
        </div>
        {children}
      </div>
    </div>
  );
}
