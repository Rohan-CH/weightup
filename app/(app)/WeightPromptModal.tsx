'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Activity, X } from 'lucide-react';

export default function WeightPromptModal() {
  const [show, setShow] = useState(false);
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    checkWeightStatus();
  }, []);

  const checkWeightStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Check last weight log
    const { data } = await supabase
      .from('body_metrics')
      .select('logged_at')
      .eq('user_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) {
      // No weight logged ever, show prompt
      setShow(true);
      return;
    }

    const lastLog = new Date(data.logged_at).getTime();
    const now = Date.now();
    const diffDays = (now - lastLog) / (1000 * 60 * 60 * 24);

    // Prompt if older than 7 days
    if (diffDays > 7) {
      setShow(true);
    }
  };

  const handleSave = async () => {
    if (!weight || isNaN(parseFloat(weight))) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('body_metrics')
      .insert({
        user_id: user.id,
        weight_kg: parseFloat(weight)
      });

    if (!error) {
      setShow(false);
      // Optional: trigger an event so profile/dashboard can refresh if open
      window.dispatchEvent(new Event('weight-updated'));
    }
    setSaving(false);
  };

  if (!show) return null;

  return (
    <div className="dash-drawer-overlay" style={{ zIndex: 9999 }}>
      <div className="card animate-fade-in-up" style={{ 
        maxWidth: 400, 
        width: '90%', 
        margin: 'auto', 
        marginTop: '20vh',
        position: 'relative',
        border: '1px solid var(--accent-orange)'
      }}>
        <button 
          onClick={() => setShow(false)} 
          style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '12px 0' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(249, 115, 22, 0.1)', color: 'var(--accent-orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Activity size={24} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0' }}>Update Your Weight</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
            It's been a while since you logged your body weight. Tracking this helps measure progress!
          </p>
          
          <div style={{ width: '100%', marginBottom: 24 }}>
            <input
              type="number"
              step="0.1"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              placeholder="Current Weight (kg)"
              className="input"
              style={{ textAlign: 'center', fontSize: 18, padding: '12px' }}
              autoFocus
            />
          </div>
          
          <button 
            className="btn-primary" 
            style={{ width: '100%', background: 'var(--accent-orange)', borderColor: 'var(--accent-orange)' }}
            onClick={handleSave}
            disabled={saving || !weight}
          >
            {saving ? <span className="spinner" /> : 'Log Weight'}
          </button>
        </div>
      </div>
    </div>
  );
}
