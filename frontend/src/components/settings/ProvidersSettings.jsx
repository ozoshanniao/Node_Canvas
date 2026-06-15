import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import {
  clearProviderSettings,
  fetchProviderSettings,
  saveProviderSettings,
} from '../../utils/providerSettings';

const PROVIDER_FIELDS = {
  deepseek: [{ id: 'apiKey', labelKey: 'settings.providers.apiKey', placeholderKey: 'settings.providers.enterApiKey' }],
  google: [{ id: 'apiKey', labelKey: 'settings.providers.apiKey', placeholderKey: 'settings.providers.enterApiKey' }],
  yunwu: [{ id: 'apiKey', labelKey: 'settings.providers.apiKey', placeholderKey: 'settings.providers.enterApiKey' }],
  seedance: [{ id: 'apiKey', labelKey: 'settings.providers.apiKey', placeholderKey: 'settings.providers.enterApiKey' }],
  kling: [
    { id: 'accessKey', labelKey: 'settings.providers.accessKey', placeholderKey: 'settings.providers.enterAccessKey' },
    { id: 'secretKey', labelKey: 'settings.providers.secretKey', placeholderKey: 'settings.providers.enterSecretKey' },
  ],
  'cloudflare-r2': [
    { id: 'accessKeyId', labelKey: 'settings.providers.accessKeyId', placeholderKey: 'settings.providers.enterAccessKeyId' },
    { id: 'secretAccessKey', labelKey: 'settings.providers.secretAccessKey', placeholderKey: 'settings.providers.enterSecretAccessKey' },
  ],
};

export function ProvidersSettings() {
  const { t } = useI18n();
  const [providers, setProviders] = useState([]);
  const [status, setStatus] = useState('loading');

  const loadProviders = useCallback(async () => {
    try {
      setProviders(await fetchProviderSettings());
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchProviderSettings()
      .then((nextProviders) => {
        if (!cancelled) {
          setProviders(nextProviders);
          setStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="text-sm font-light text-white/85">{t('settings.providers.envReadOnly')}</div>
        <div className="mt-2 max-w-3xl text-xs leading-5 text-white/35">{t('settings.providers.security')}</div>
      </div>

      {status === 'loading' && <StatusPanel>{t('settings.providers.loading')}</StatusPanel>}
      {status === 'error' && <StatusPanel error>{t('settings.providers.loadFailed')}</StatusPanel>}

      {status === 'success' && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {providers.map((provider) => (
            <ProviderStatusCard key={provider.id} provider={provider} t={t} onRefresh={loadProviders} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPanel({ children, error = false }) {
  return (
    <div className={`mt-4 rounded-2xl border p-5 text-xs ${error ? 'border-red-400/15 bg-red-400/[0.04] text-red-200/70' : 'border-white/[0.07] bg-white/[0.025] text-white/40'}`}>
      {children}
    </div>
  );
}

function ProviderStatusCard({ provider, t, onRefresh }) {
  const fields = PROVIDER_FIELDS[provider.id] || [];
  const [values, setValues] = useState({});
  const [actionStatus, setActionStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const settingsEditable = provider.supportsSettings && provider.source !== 'env' && fields.length > 0;
  const canSave = settingsEditable && fields.every((field) => values[field.id]?.trim()) && actionStatus === 'idle';

  const handleSave = async () => {
    setActionStatus('saving');
    setMessage('');
    try {
      await saveProviderSettings(provider.id, Object.fromEntries(fields.map((field) => [field.id, values[field.id].trim()])));
      setValues({});
      setMessage(t('settings.providers.saved'));
      await onRefresh();
    } catch {
      setMessage(t('settings.providers.saveFailed'));
    } finally {
      setActionStatus('idle');
    }
  };

  const handleClear = async () => {
    setActionStatus('clearing');
    setMessage('');
    try {
      await clearProviderSettings(provider.id);
      setValues({});
      setMessage(t('settings.providers.cleared'));
      await onRefresh();
    } catch {
      setMessage(t('settings.providers.clearFailed'));
    } finally {
      setActionStatus('idle');
    }
  };

  return (
    <section className={`min-w-0 rounded-2xl border p-5 ${provider.configured ? 'border-emerald-400/20 bg-emerald-400/[0.045]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-sm font-light text-white/85">{provider.name}</div>
        <StatusBadge provider={provider} t={t} />
      </div>

      {provider.source === 'env' && (
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2.5 text-[10px] leading-4 text-white/35">
          {t('settings.providers.envOverrideDisabled')}
        </div>
      )}

      {provider.missingDependencyEnv.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] px-3 py-2.5 text-[10px] leading-4 text-amber-200/65">
          {t('settings.providers.missingDependencies')} {t('settings.providers.editEnvRestart')}
        </div>
      )}

      {settingsEditable && (
        <div className="mt-4 grid gap-3">
          {fields.map((field) => (
            <label key={field.id} className="block">
              <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-white/30">{t(field.labelKey)}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={values[field.id] || ''}
                onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                placeholder={provider.source === 'settings' ? t('settings.providers.replacePlaceholder') : t(field.placeholderKey)}
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white/80 outline-none transition-colors placeholder:text-white/20 focus:border-white/25"
              />
            </label>
          ))}
          <div className="flex items-center justify-end gap-2">
            {provider.source === 'settings' && (
              <button type="button" disabled={actionStatus !== 'idle'} onClick={handleClear} className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-white/45 transition-colors hover:bg-white/5 hover:text-white/75 disabled:opacity-40">
                {t('settings.providers.clear')}
              </button>
            )}
            <button type="button" disabled={!canSave} onClick={handleSave} className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-[10px] text-white/80 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
              {t('settings.providers.save')}
            </button>
          </div>
          {message && <div className="text-right text-[10px] text-white/40">{message}</div>}
        </div>
      )}

      <ProviderEnvList label={t('settings.providers.requiredEnv')} values={provider.requiredEnv} />
      {provider.missingEnv.length > 0 && <ProviderEnvList label={t('settings.providers.missingEnv')} values={provider.missingEnv} missing />}

      <div className="mt-3 border-t border-white/5 pt-3 text-[10px] text-white/30">
        {t('settings.providers.source')}: {t(`settings.providers.source.${provider.source}`)}
      </div>
    </section>
  );
}

function StatusBadge({ provider, t }) {
  const text = provider.source === 'env'
    ? t('settings.providers.configuredViaEnv')
    : provider.source === 'settings'
      ? t('settings.providers.configuredViaSettings')
      : t('settings.providers.notConfigured');
  return (
    <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] ${provider.configured ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-black/20 text-white/40'}`}>
      {text}
    </div>
  );
}

function ProviderEnvList({ label, values, missing = false }) {
  return (
    <div className="mt-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/25">{label}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <code key={value} className={`rounded-md border px-2 py-1 text-[10px] ${missing ? 'border-amber-400/15 bg-amber-400/[0.04] text-amber-200/65' : 'border-white/[0.07] bg-black/20 text-white/40'}`}>
            {value}
          </code>
        ))}
      </div>
    </div>
  );
}
