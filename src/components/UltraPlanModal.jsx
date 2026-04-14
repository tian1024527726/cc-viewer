import React from 'react';
import { t } from '../i18n';
import { apiUrl } from '../utils/apiUrl';
import { getModelMaxTokens } from '../utils/helpers';
import styles from './UltraPlanModal.module.css';

export default function UltraPlanModal({
  open, variant, prompt, files, modelName, agentTeamEnabled,
  onClose, onVariantChange, onPromptChange, onSend, onUpload, onPaste, onRemoveFile,
}) {
  if (!open) return null;

  const hasContent = (prompt || '').trim() || files.length > 0;
  const lowContext = !modelName || getModelMaxTokens(modelName) < 1000000;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{t('ui.ultraplan.title')}</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {!agentTeamEnabled ? (
          <div className={styles.disabledTip}>{t('ui.ultraplan.agentTeamRequired')}</div>
        ) : (
          <>
            <div className={styles.variantRow}>
              <button
                className={`${styles.roleBtn} ${variant === 'codeExpert' ? styles.roleBtnActive : ''}`}
                onClick={() => onVariantChange('codeExpert')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                {t('ui.ultraplan.roleCodeExpert')}
              </button>
              <button
                className={`${styles.roleBtn} ${variant === 'researchExpert' ? styles.roleBtnActive : ''}`}
                onClick={() => onVariantChange('researchExpert')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                {t('ui.ultraplan.roleResearchExpert')}
              </button>
            </div>

            {lowContext && (
              <div className={styles.contextWarning}>{t('ui.ultraplan.contextWarning')}</div>
            )}

            {files.length > 0 && (
              <div className={styles.fileList}>
                {files.map((f, i) => {
                  const isImage = /\.(png|jpe?g|gif|svg|bmp|webp|avif|ico|icns)$/i.test(f.name);
                  return isImage ? (
                    <div key={i} className={styles.imageItem} title={f.name}>
                      <img src={apiUrl(`/api/file-raw?path=${encodeURIComponent(f.path)}`)} className={styles.imageThumb} alt={f.name} />
                      <button className={styles.imageRemove} onClick={() => onRemoveFile(i)}>&times;</button>
                    </div>
                  ) : (
                    <span key={i} className={styles.fileChip} title={f.name}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className={styles.fileName}>{f.name}</span>
                      <span className={styles.fileRemove} onClick={() => onRemoveFile(i)}>&times;</span>
                    </span>
                  );
                })}
              </div>
            )}

            <textarea
              className={styles.textarea}
              value={prompt}
              onChange={e => onPromptChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && hasContent) { e.preventDefault(); onSend(); } }}
              onPaste={onPaste}
              placeholder={t('ui.ultraplan.placeholder')}
              rows={5}
              autoFocus
            />

            <div className={styles.footer}>
              <button className={styles.sendBtn} disabled={!hasContent} onClick={onSend}>{t('ui.ultraplan.send')}</button>
              <button className={styles.uploadBtn} onClick={onUpload}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                {t('ui.ultraplan.upload')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
