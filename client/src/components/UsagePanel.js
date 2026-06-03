import React from 'react';
import { Paper, Typography, Box } from '@mui/material';

// Re-derived here so the component is self-contained (same value as App.js).
const API_URL = process.env.REACT_APP_API_URL || '';

/**
 * UsagePanel — admin-only cost/usage readout for a finished translation job.
 *
 * Security: renders NOTHING unless an admin key is present (localStorage
 * 'adminKey' or ?adminKey= query param). The public /api/result payload has
 * usage stripped, so cost data is fetched from the admin-gated endpoint and
 * must never be shown to public users.
 */
function UsagePanel({ resultToken }) {
  const params = new URLSearchParams(window.location.search);
  const adminKey = params.get('adminKey') || localStorage.getItem('adminKey');

  const [job, setJob] = React.useState(null);

  React.useEffect(() => {
    if (!adminKey || !resultToken) {
      setJob(null);
      return;
    }
    let cancelled = false;
    fetch(`${API_URL}/api/admin/usage`, { headers: { 'x-admin-key': adminKey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.jobs)) return;
        const match = data.jobs.find((j) => j.token === resultToken) || null;
        setJob(match);
      })
      .catch(() => {
        // Errors → render nothing for this fetch.
        if (!cancelled) setJob(null);
      });
    return () => {
      cancelled = true;
    };
  }, [adminKey, resultToken]);

  // Gate: no admin key or no token → render nothing (public users).
  if (!adminKey || !resultToken) return null;

  const totals = job && job.totals ? job.totals : null;
  const byModel = job && job.byModel ? job.byModel : {};

  return (
    <Paper sx={{ mt: 2, p: 2 }} data-testid="usage-panel">
      <Typography variant="subtitle2" gutterBottom>
        Обработка (admin)
      </Typography>
      {!totals ? (
        <Typography variant="body2">—</Typography>
      ) : (
        <Box>
          <Typography variant="body2">
            Токены: in {totals.in} · out {totals.out} · total {totals.total}
          </Typography>
          <Typography variant="body2">
            Стоимость: ${Number(totals.costUsd || 0).toFixed(4)}
          </Typography>
          <Box sx={{ mt: 1 }}>
            {Object.entries(byModel).map(([model, m]) => (
              <Typography key={model} variant="caption" component="div" color="text.secondary">
                {model} · {m.calls} calls · ${Number(m.costUsd || 0).toFixed(4)}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
}

export default UsagePanel;
