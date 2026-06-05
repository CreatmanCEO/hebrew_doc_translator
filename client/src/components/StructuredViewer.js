import React, { useState, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@mui/material';
import { useT } from '../i18n';

// Soft accent tint used to highlight the active element on both columns.
const HL_COLOR = 'rgba(99, 102, 241, 0.12)'; // indigo accent, low alpha

// Map a heading level to a MUI Typography variant (clamped h4..h6).
function headingVariant(level) {
  if (level <= 1) return 'h4';
  if (level === 2) return 'h5';
  return 'h6';
}

/**
 * StructuredViewer
 * Renders a StructuredDoc (schemaVersion 2) as two synchronized columns:
 *   left  = source (dir="rtl")
 *   right = target (dir="ltr")
 *
 * The SAME element list is rendered on both sides; left reads `.source`,
 * right reads `.target`. Hover/click an element to highlight that element
 * index on BOTH columns.
 *
 * Security: ALL text is rendered as React children. dangerouslySetInnerHTML
 * is never used, so HTML inside any field shows up as literal text and cannot
 * be injected into the DOM. Tables and lists are built from React elements.
 */
function StructuredViewer({ doc }) {
  const t = useT();
  const [active, setActive] = useState(null); // element index or null

  const setActiveIdx = useCallback((idx) => setActive(idx), []);
  const clearActive = useCallback(
    () => setActive((prev) => (prev === null ? prev : null)),
    []
  );

  // Render a single element's content for a given side ('source' | 'target').
  const renderContent = (el, side) => {
    const pick = (cell) => (cell ? cell[side] : '');

    switch (el.type) {
      case 'heading':
        return (
          <Typography
            variant={headingVariant(el.level || 1)}
            sx={{ fontWeight: 700 }}
          >
            {pick(el)}
          </Typography>
        );

      case 'paragraph':
        return (
          <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
            {pick(el)}
          </Typography>
        );

      case 'list': {
        const items = el.items || [];
        const ListTag = el.ordered ? 'ol' : 'ul';
        return (
          <Box
            component={ListTag}
            sx={{ m: 0, pl: 3, lineHeight: 1.8 }}
          >
            {items.map((item, i) => (
              <li key={i}>{item ? item[side] : ''}</li>
            ))}
          </Box>
        );
      }

      case 'table': {
        const rows = el.rows || [];
        return (
          <Table size="small">
            <TableBody>
              {rows.map((row, ri) => (
                <TableRow key={ri}>
                  {(row || []).map((cell, ci) => (
                    <TableCell key={ci}>{pick(cell)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        );
      }

      default:
        return null;
    }
  };

  const renderColumn = (side) => {
    const dir = side === 'source' ? 'rtl' : 'ltr';
    const headerKey = side === 'source' ? 'viewerSource' : 'viewerTarget';
    return (
      <Paper
        variant="outlined"
        sx={{ p: 2, height: '100%', maxHeight: '70vh', overflow: 'auto' }}
      >
        <Typography
          variant="subtitle2"
          gutterBottom
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          {t(headerKey)}
        </Typography>
        <Box dir={dir}>
          {(doc?.elements || []).map((el, idx) => {
            const isHl = active === idx;
            return (
              <Box
                key={idx}
                data-el={idx}
                className={isHl ? 'hl' : undefined}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseLeave={clearActive}
                onClick={() => setActiveIdx(idx)}
                sx={{
                  my: 1,
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  cursor: 'pointer',
                  backgroundColor: isHl ? HL_COLOR : 'transparent',
                  unicodeBidi: 'plaintext',
                }}
              >
                {renderContent(el, side)}
              </Box>
            );
          })}
        </Box>
      </Paper>
    );
  };

  return (
    <Paper sx={{ mt: 2, p: 2 }} data-testid="structured-viewer">
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          {renderColumn('source')}
        </Grid>
        <Grid item xs={12} md={6}>
          {renderColumn('target')}
        </Grid>
      </Grid>
    </Paper>
  );
}

export default StructuredViewer;
