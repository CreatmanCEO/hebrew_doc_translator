import React, { useState, useCallback } from 'react';
import { Box, Grid, Paper, Typography } from '@mui/material';

// Build a Set-membership key for a token span.
const tokenKey = (side, blockId, sentenceId, tokenIdx) =>
  `${side}:${blockId}:${sentenceId}:${tokenIdx}`;

const HL_COLOR = '#fff59d'; // light yellow highlight

/**
 * SideBySideViewer
 * Renders a TranslationDocument as two synchronized panes:
 *   left  = source (dir="rtl")
 *   right = target (dir="ltr")
 *
 * Security: ALL token/sentence text is rendered as React text children.
 * dangerouslySetInnerHTML is never used, so any HTML inside a token shows
 * up as literal text and cannot be injected into the DOM.
 *
 * Highlighting: hover/click a token to highlight aligned token(s) on the
 * other side (word-level when `align` is present, otherwise whole-sentence
 * fallback). Clicking the sentence wrapper highlights the paired sentence
 * on both sides.
 */
function SideBySideViewer({ doc }) {
  // Set<string> of highlighted token keys (see tokenKey()).
  const [highlighted, setHighlighted] = useState(() => new Set());

  // Highlight every token of a sentence on both sides.
  const highlightWholeSentence = useCallback((blockId, sentence) => {
    const next = new Set();
    (sentence.srcTokens || []).forEach((_, i) =>
      next.add(tokenKey('src', blockId, sentence.id, i))
    );
    (sentence.tgtTokens || []).forEach((_, i) =>
      next.add(tokenKey('tgt', blockId, sentence.id, i))
    );
    setHighlighted(next);
  }, []);

  // Highlight from a single hovered/clicked token.
  const highlightFromToken = useCallback(
    (side, blockId, sentence, tokenIdx) => {
      const next = new Set();
      // The token itself is always highlighted.
      next.add(tokenKey(side, blockId, sentence.id, tokenIdx));

      const align = sentence.align;
      const otherSide = side === 'src' ? 'tgt' : 'src';

      if (!align || align.length === 0) {
        // Word-level alignment unavailable: fall back to whole paired sentence.
        highlightWholeSentence(blockId, sentence);
        // Also re-include the hovered token (already in set above) so the
        // hovered side keeps its own highlight.
        return;
      }

      const fromKey = side === 'src' ? 'src' : 'tgt';
      const toKey = side === 'src' ? 'tgt' : 'src';
      align.forEach((group) => {
        const fromIdxs = group[fromKey] || [];
        if (fromIdxs.includes(tokenIdx)) {
          (group[toKey] || []).forEach((j) =>
            next.add(tokenKey(otherSide, blockId, sentence.id, j))
          );
        }
      });

      setHighlighted(next);
    },
    [highlightWholeSentence]
  );

  const clearHighlight = useCallback(() => {
    setHighlighted((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const renderTokens = (side, block, sentence) => {
    const tokens = side === 'src' ? sentence.srcTokens : sentence.tgtTokens;
    return (tokens || []).map((tok, i) => {
      const key = tokenKey(side, block.id, sentence.id, i);
      const isHl = highlighted.has(key);
      return (
        <React.Fragment key={key}>
          {i > 0 ? ' ' : null}
          <span
            data-side={side}
            data-block={block.id}
            data-sentence={sentence.id}
            data-token={i}
            className={isHl ? 'hl' : undefined}
            style={{
              backgroundColor: isHl ? HL_COLOR : undefined,
              borderRadius: 3,
              cursor: 'pointer',
            }}
            onMouseEnter={() => highlightFromToken(side, block.id, sentence, i)}
            onMouseLeave={clearHighlight}
            onClick={(e) => {
              // Token click acts like hover-highlight; stop it from also
              // triggering the sentence-level click handler.
              e.stopPropagation();
              highlightFromToken(side, block.id, sentence, i);
            }}
          >
            {/* Rendered as a text child => XSS-safe, never HTML. */}
            {tok}
          </span>
        </React.Fragment>
      );
    });
  };

  const renderPane = (side) => {
    const dir = side === 'src' ? 'rtl' : 'ltr';
    return (
      <Box dir={dir} sx={{ p: 2 }}>
        {(doc?.blocks || []).map((block) => (
          <Box
            key={`${side}:${block.id}`}
            data-block-wrapper={block.id}
            component="p"
            sx={{ my: 1, lineHeight: 1.8 }}
          >
            {(block.sentences || []).map((sentence) => (
              <span
                key={`${side}:${block.id}:${sentence.id}`}
                data-sentence-wrapper={sentence.id}
                // Sentence-level click (when not on a token) highlights the
                // entire paired sentence on both sides.
                onClick={() => highlightWholeSentence(block.id, sentence)}
                style={{
                  // unicodeBidi: plaintext keeps mixed Hebrew + Latin/numbers
                  // rendering in correct visual order.
                  unicodeBidi: 'plaintext',
                }}
              >
                {renderTokens(side, block, sentence)}{' '}
              </span>
            ))}
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Paper sx={{ mt: 2, p: 2 }} data-testid="side-by-side-viewer">
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom>
            {doc?.sourceLang ? doc.sourceLang.toUpperCase() : 'Source'}
          </Typography>
          {renderPane('src')}
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom>
            {doc?.targetLang ? doc.targetLang.toUpperCase() : 'Target'}
          </Typography>
          {renderPane('tgt')}
        </Grid>
      </Grid>
    </Paper>
  );
}

export default SideBySideViewer;
