"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface ModuleConfig {
  id: string;
  name: string;
  type: 'api' | 'service' | 'integration';
  enabled: boolean;
  config: Record<string, any>;
  description?: string;
  version?: string;
}

export default function ModulesPage() {
  const [modules, setModules] = useState<ModuleConfig[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleConfig | null>(null);
  const [newModule, setNewModule] = useState<Partial<ModuleConfig>>({
    name: '',
    type: 'api',
    enabled: true,
    config: {},
    description: '',
    version: '1.0.0',
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      // Încearcă să încarce din Supabase
      const response = await fetch('/api/admin/modules/config', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.modules) {
          // Mapează datele din Supabase
          let modulesList: ModuleConfig[] = (result.modules || []).map((m: any) => ({
            id: m.module_id,
            name: m.module_name,
            type: m.module_type as 'api' | 'service' | 'integration',
            enabled: m.enabled || false,
            config: m.config || {},
            description: m.description || '',
            version: m.version || '1.0.0',
          }));

          // Asigură că modulele implicite (Oblio, Netopia, etc.) există chiar dacă DB e gol
          const defaultIds = ['smartbill', 'oblio', 'payu', 'netopia', 'google-auth', 'facebook-auth', 'resend', 'google-maps'];
          const defaultModules: ModuleConfig[] = [
            { id: 'smartbill', name: 'SmartBill', type: 'api', enabled: false, config: {}, description: 'Integrare SmartBill pentru facturare automată', version: '1.0.0' },
            { id: 'oblio', name: 'Oblio.eu', type: 'api', enabled: false, config: {}, description: 'Integrare Oblio.eu pentru facturare și e-Factura', version: '1.0.0' },
            { id: 'payu', name: 'PayU Payments', type: 'api', enabled: false, config: {}, description: 'Plăți cu card – alternativă opțională (site-ul folosește Netopia)', version: '1.0.0' },
            { id: 'netopia', name: 'Netopia Payments', type: 'api', enabled: false, config: {}, description: 'Metodă principală de plată cu card (credite, tokeni, premium)', version: '1.0.0' },
            { id: 'google-auth', name: 'Google OAuth', type: 'api', enabled: false, config: {}, description: 'Autentificare cu Google pentru utilizatori', version: '1.0.0' },
            { id: 'facebook-auth', name: 'Facebook OAuth', type: 'api', enabled: false, config: {}, description: 'Autentificare cu Facebook pentru utilizatori', version: '1.0.0' },
            { id: 'resend', name: 'Resend', type: 'api', enabled: false, config: {}, description: 'Serviciu pentru trimiterea de email-uri', version: '1.0.0' },
            { id: 'google-maps', name: 'Google Maps', type: 'api', enabled: false, config: {}, description: 'Integrare Google Maps pentru afișarea hărților și geocodarea adreselor', version: '1.0.0' },
          ];
          defaultIds.forEach((id) => {
            if (!modulesList.find((m) => m.id === id)) {
              const def = defaultModules.find((d) => d.id === id);
              if (def) modulesList.push(def);
            }
          });
          modulesList.sort((a, b) => a.name.localeCompare(b.name));
          
          setModules(modulesList);
          
          // Salvează și în localStorage ca backup
          localStorage.setItem('admin_modules', JSON.stringify(modulesList));
          return;
        }
      }
    } catch (error) {
      console.error('Error loading modules from Supabase:', error);
    }

    // Fallback la localStorage dacă Supabase eșuează
    const savedModules = localStorage.getItem('admin_modules');
    let modulesList: ModuleConfig[] = [];
    
    if (savedModules) {
      try {
        modulesList = JSON.parse(savedModules);
      } catch (e) {
        console.error('Error loading modules from localStorage:', e);
      }
    }

    // Default modules that should always exist
    const defaultModules: ModuleConfig[] = [
      {
        id: 'smartbill',
        name: 'SmartBill',
        type: 'api',
        enabled: false,
        config: {},
        description: 'Integrare SmartBill pentru facturare automată',
        version: '1.0.0',
      },
      {
        id: 'oblio',
        name: 'Oblio.eu',
        type: 'api',
        enabled: false,
        config: {},
        description: 'Integrare Oblio.eu pentru facturare și e-Factura',
        version: '1.0.0',
      },
      {
        id: 'payu',
        name: 'PayU Payments',
        type: 'api',
        enabled: false,
        config: {},
        description: 'Plăți cu card – alternativă opțională (site-ul folosește Netopia)',
        version: '1.0.0',
      },
      {
        id: 'netopia',
        name: 'Netopia Payments',
        type: 'api',
        enabled: false,
        config: {},
        description: 'Metodă principală de plată cu card (credite, tokeni, premium)',
        version: '1.0.0',
      },
      {
        id: 'google-auth',
        name: 'Google OAuth',
        type: 'api',
        enabled: false,
        config: {},
        description: 'Autentificare cu Google pentru utilizatori',
        version: '1.0.0',
      },
      {
        id: 'facebook-auth',
        name: 'Facebook OAuth',
        type: 'api',
        enabled: false,
        config: {},
        description: 'Autentificare cu Facebook pentru utilizatori',
        version: '1.0.0',
      },
      {
        id: 'resend',
        name: 'Resend',
        type: 'api',
        enabled: false,
        config: {},
        description: 'Serviciu pentru trimiterea de email-uri',
        version: '1.0.0',
      },
      {
        id: 'google-maps',
        name: 'Google Maps',
        type: 'api',
        enabled: false,
        config: {},
        description: 'Integrare Google Maps pentru afișarea hărților și geocodarea adreselor',
        version: '1.0.0',
      },
    ];

    // Merge default modules with saved modules
    defaultModules.forEach(defaultModule => {
      const exists = modulesList.find(m => m.id === defaultModule.id);
      if (!exists) {
        modulesList.push(defaultModule);
      }
    });

    setModules(modulesList);
    localStorage.setItem('admin_modules', JSON.stringify(modulesList));
  };

  const saveModules = async (updatedModules: ModuleConfig[]) => {
    setModules(updatedModules);
    
    // Salvează în localStorage ca backup
    localStorage.setItem('admin_modules', JSON.stringify(updatedModules));
    
    // Salvează în Supabase pentru fiecare modul
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // API așteaptă { modules: [...] }
      const response = await fetch('/api/admin/modules/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modules: updatedModules.map((module) => ({
            id: module.id,
            name: module.name,
            type: module.type,
            enabled: module.enabled,
            config: module.config,
            description: module.description,
            version: module.version,
          })),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Error saving modules:', text);
      }
    } catch (error) {
      console.error('Error saving modules to Supabase:', error);
      // Continuă oricum, datele sunt salvate în localStorage
    }
  };

  const handleAddModule = () => {
    if (!newModule.name || !newModule.type) {
      setMessage({ type: 'error', text: 'Vă rugăm să completați numele și tipul modulului!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }

    const module: ModuleConfig = {
      id: `module-${Date.now()}`,
      name: newModule.name || '',
      type: newModule.type as 'api' | 'service' | 'integration',
      enabled: newModule.enabled ?? true,
      config: newModule.config || {},
      description: newModule.description || '',
      version: newModule.version || '1.0.0',
    };

    const updatedModules = [...modules, module];
    saveModules(updatedModules);
    setMessage({ type: 'success', text: 'Modulul a fost adăugat cu succes!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    setShowAddModal(false);
    setNewModule({
      name: '',
      type: 'api',
      enabled: true,
      config: {},
      description: '',
      version: '1.0.0',
    });
  };

  const handleDeleteModule = (id: string) => {
    if (confirm('Sigur vrei să ștergi acest modul?')) {
      const updatedModules = modules.filter(m => m.id !== id);
      saveModules(updatedModules);
      setMessage({ type: 'success', text: 'Modulul a fost șters cu succes!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const verifyModule = async (module: ModuleConfig): Promise<{ success: boolean; message: string }> => {
    // Folosește configurația din modulul încărcat din Supabase
    const config = module.config || {};

    // Verify SmartBill module
    if (module.id === 'smartbill') {
      if (!config.username || !config.token || !config.companyVATNumber) {
        return {
          success: false,
          message: 'SmartBill nu este configurat! Completează configurația mai întâi.'
        };
      }

      return {
        success: true,
        message: 'Configurația SmartBill este validă! (Verificare conexiune disponibilă în versiuni viitoare)'
      };
    }

    // Verify Oblio.eu module
    if (module.id === 'oblio') {
      if (!config.clientId || !config.clientSecret) {
        return {
          success: false,
          message: 'Oblio.eu nu este configurat! Completează email-ul și token-ul (Setări > Date Cont în contul Oblio).'
        };
      }
      return {
        success: true,
        message: 'Configurația Oblio.eu este validă! Folosește "Testează conexiunea" pentru verificare.'
      };
    }

    // Verify PayU Payments module
    if (module.id === 'payu') {
      const isTest = config.testMode !== false;
      const clientId = isTest ? config.clientIdTest : config.clientIdLive;
      const clientSecret = isTest ? config.clientSecretTest : config.clientSecretLive;
      const posId = isTest ? config.merchantPosIdTest : config.merchantPosIdLive;
      if (!clientId?.trim() || !clientSecret?.trim() || !posId?.trim()) {
        return { success: false, message: `PayU ${isTest ? 'Test' : 'Live'}: completează Client ID, Client Secret și Merchant POS ID.` };
      }
      return { success: true, message: `Configurația PayU (${isTest ? 'Test' : 'Live'}) este validă! Salvează și folosește "Testează conexiunea".` };
    }

    // Verify Netopia Payments module (credentiale separate Test/Live)
    if (module.id === 'netopia') {
      const isTest = config.testMode !== false;
      const sig = isTest ? config.merchantSignatureTest : config.merchantSignatureLive;
      const pubKey = isTest ? config.publicKeyTest : config.publicKeyLive;
      const privKey = isTest ? config.privateKeyTest : config.privateKeyLive;
      if (!sig?.trim() || !pubKey?.trim() || !privKey?.trim()) {
        return {
          success: false,
          message: `Netopia ${isTest ? 'Test' : 'Live'}: completează Semnătura, Public Key și Private Key.`
        };
      }
      return {
        success: true,
        message: `Configurația Netopia (${isTest ? 'Test' : 'Live'}) este validă!`
      };
    }

    // Verify Google Auth module
    if (module.id === 'google-auth') {
      if (!config.clientId || !config.clientSecret) {
        return {
          success: false,
          message: 'Google OAuth nu este configurat! Completează configurația mai întâi.'
        };
      }

      return {
        success: true,
        message: 'Configurația Google OAuth este validă! (Verificare conexiune disponibilă în versiuni viitoare)'
      };
    }

    // Verify Facebook Auth module
    if (module.id === 'facebook-auth') {
      if (!config.appId || !config.appSecret) {
        return {
          success: false,
          message: 'Facebook OAuth nu este configurat! Completează configurația mai întâi.'
        };
      }

      return {
        success: true,
        message: 'Configurația Facebook OAuth este validă! (Verificare conexiune disponibilă în versiuni viitoare)'
      };
    }

    // Verify Resend Email module
    if (module.id === 'resend') {
      if (!config.apiKey) {
        return {
          success: false,
          message: 'Resend nu este configurat! Completează configurația mai întâi.'
        };
      }

      // Validate API key format (should start with 're_')
      if (!config.apiKey.startsWith('re_')) {
        return {
          success: false,
          message: 'API Key invalid! API Key-ul Resend trebuie să înceapă cu "re_"'
        };
      }

      return {
        success: true,
        message: 'Configurația Resend este validă! (Verificare conexiune disponibilă în versiuni viitoare)'
      };
    }

    // Verify Google Maps module
    if (module.id === 'google-maps') {
      try {
        const config = module.config || {};
        
        if (!config.apiKey) {
          return {
            success: false,
            message: 'Configurația Google Maps este incompletă! Completează API Key-ul.'
          };
        }

        // Test by trying to geocode a simple address
        try {
          const testResponse = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?address=Bucuresti&key=${config.apiKey}`
          );
          
          if (testResponse.ok) {
            const data = await testResponse.json();
            if (data.status === 'OK') {
              return {
                success: true,
                message: 'Configurația Google Maps verificată cu succes!'
              };
            } else if (data.status === 'REQUEST_DENIED') {
              return {
                success: false,
                message: 'API Key invalid sau restrictiile API-ului nu permit accesul. Verifică setările în Google Cloud Console.'
              };
            } else {
              return {
                success: false,
                message: `Eroare Google Maps API: ${data.status}`
              };
            }
          } else {
            return {
              success: false,
              message: 'Eroare la testarea API-ului Google Maps. Verifică API Key-ul.'
            };
          }
        } catch (e: any) {
          return {
            success: false,
            message: `Eroare la testarea API-ului: ${e.message}`
          };
        }
      } catch (error: any) {
        return {
          success: false,
          message: `Eroare la verificarea modulului: ${error.message}`
        };
      }
    }

    // For other modules, check if config is provided for API modules
    if (module.type === 'api' && Object.keys(module.config || {}).length === 0) {
      return {
        success: false,
        message: 'Modulul API necesită configurație! Configurează modulul mai întâi.'
      };
    }

    // Default: allow activation if basic checks pass
    return {
      success: true,
      message: 'Modulul verificat cu succes!'
    };
  };

  const handleToggleModule = async (id: string) => {
    const module = modules.find(m => m.id === id);
    if (!module) return;

    // If trying to enable, verify first
    if (!module.enabled) {
      setMessage({ type: 'info', text: 'Verific configurația modulului...' });
      
      const verification = await verifyModule(module);
      
      if (!verification.success) {
        setMessage({ 
          type: 'error', 
          text: `Nu se poate activa: ${verification.message}` 
        });
        setTimeout(() => setMessage({ type: '', text: '' }), 5000);
        return;
      }

      // If verification passed, enable the module
      const updatedModules = modules.map(m =>
        m.id === id ? { ...m, enabled: true } : m
      );
      saveModules(updatedModules);
      setMessage({ 
        type: 'success', 
        text: `${verification.message} Modulul a fost activat!` 
      });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
    } else {
      // If disabling, just do it
      const updatedModules = modules.map(m =>
        m.id === id ? { ...m, enabled: false } : m
      );
      saveModules(updatedModules);
      setMessage({ type: 'success', text: 'Modulul a fost dezactivat!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleEditConfig = (module: ModuleConfig) => {
    // Configurația este deja încărcată din Supabase în loadModules
    // Doar setează modulul selectat
    setSelectedModule(module);
    setShowConfigModal(true);
  };

  const handleTestConfig = async () => {
    if (!selectedModule) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      if (selectedModule.id === 'smartbill') {
        const config = {
          username: selectedModule.config.username || '',
          token: selectedModule.config.token || '',
          companyVATNumber: selectedModule.config.companyVATNumber || '',
        };
        
        if (!config.username || !config.token || !config.companyVATNumber) {
          setTestResult({ success: false, message: 'Completează toate câmpurile obligatorii!' });
          setIsTesting(false);
          return;
        }

        // Test connection via API route
        try {
          const response = await fetch('/api/smartbill/test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
          });

          // Verifică dacă răspunsul este JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            setTestResult({ 
              success: false, 
              message: 'Serverul a returnat un răspuns invalid. Verifică dacă API route-ul există.' 
            });
            return;
          }

          const result = await response.json();

          if (result.success) {
            setTestResult({ 
              success: true, 
              message: result.message || 'Conexiunea cu SmartBill este funcțională!' 
            });
          } else {
            setTestResult({ 
              success: false, 
              message: result.message || 'Eroare la conectarea cu SmartBill' 
            });
          }
        } catch (error: any) {
          console.error('Error testing SmartBill:', error);
          setTestResult({ 
            success: false, 
            message: error.message || 'Eroare la testarea conexiunii SmartBill' 
          });
        } finally {
          setIsTesting(false);
        }
      } else if (selectedModule.id === 'oblio') {
        const config = {
          clientId: selectedModule.config.clientId || '',
          clientSecret: selectedModule.config.clientSecret || '',
        };
        if (!config.clientId || !config.clientSecret) {
          setTestResult({ success: false, message: 'Completează email-ul și token-ul Oblio (Setări > Date Cont)!' });
          setIsTesting(false);
          return;
        }
        try {
          const response = await fetch('/api/oblio/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          });
          const result = await response.json();
          if (result.success) {
            setTestResult({
              success: true,
              message: result.message || 'Conexiunea cu Oblio.eu este funcțională!',
              companies: result.companies,
            });
          } else {
            setTestResult({ success: false, message: result.message || 'Eroare la conectarea cu Oblio.eu' });
          }
        } catch (error: any) {
          setTestResult({ success: false, message: error.message || 'Eroare la testarea Oblio' });
        } finally {
          setIsTesting(false);
        }
      } else if (selectedModule.id === 'netopia') {
        const isTest = selectedModule.config.testMode !== false;
        const sig = isTest ? selectedModule.config.merchantSignatureTest : selectedModule.config.merchantSignatureLive;
        const pubKey = isTest ? selectedModule.config.publicKeyTest : selectedModule.config.publicKeyLive;
        const privKey = isTest ? selectedModule.config.privateKeyTest : selectedModule.config.privateKeyLive;
        const config = {
          publicKey: pubKey || '',
          privateKey: privKey || '',
          merchantSignature: sig || '',
          testMode: isTest,
          paymentUrl: isTest
            ? (selectedModule.config.sandboxUrl || '').trim()
            : (selectedModule.config.paymentUrlLive || '').trim(),
        };
        
        if (!config.publicKey || !config.privateKey || !config.merchantSignature) {
          setTestResult({ success: false, message: `Completează toate câmpurile pentru Mod ${isTest ? 'Test' : 'Live'}!` });
          setIsTesting(false);
          return;
        }

        // Test connection via API route
        try {
          const response = await fetch('/api/netopia/test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
          });

          // Verifică dacă răspunsul este JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            setTestResult({ 
              success: false, 
              message: 'Serverul a returnat un răspuns invalid. Verifică dacă API route-ul există.' 
            });
            setIsTesting(false);
            return;
          }

          const result = await response.json();

          if (result.success) {
            setTestResult({ 
              success: true, 
              message: result.message || 'Configurația Netopia Payments este validă!' 
            });
          } else {
            setTestResult({ 
              success: false, 
              message: result.message || 'Eroare la validarea configurației Netopia' 
            });
          }
        } catch (error: any) {
          console.error('Error testing Netopia:', error);
          setTestResult({ 
            success: false, 
            message: error.message || 'Eroare la testarea conexiunii Netopia' 
          });
        } finally {
          setIsTesting(false);
        }
      } else if (selectedModule.id === 'payu') {
        try {
          const response = await fetch('/api/payu/test', { method: 'POST' });
          const result = await response.json();
          if (result.success) {
            setTestResult({ success: true, message: result.message || 'PayU este configurat corect!' });
          } else {
            setTestResult({ success: false, message: result.message || 'Eroare la verificarea PayU.' });
          }
        } catch (error: any) {
          setTestResult({ success: false, message: error.message || 'Eroare la testarea PayU.' });
        } finally {
          setIsTesting(false);
        }
      } else if (selectedModule.id === 'google-auth') {
        const config = {
          clientId: selectedModule.config.clientId || '',
          clientSecret: selectedModule.config.clientSecret || '',
          redirectUri: selectedModule.config.redirectUri || '',
        };
        
        if (!config.clientId || !config.clientSecret) {
          setTestResult({ success: false, message: 'Completează Client ID și Client Secret!' });
          setIsTesting(false);
          return;
        }

        // Test connection via API route
        try {
          const response = await fetch('/api/google-oauth/test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              clientId: config.clientId,
              clientSecret: config.clientSecret,
              redirectUri: config.redirectUri,
            }),
          });

          // Verifică dacă răspunsul este JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            setTestResult({ 
              success: false, 
              message: 'Serverul a returnat un răspuns invalid. Verifică dacă API route-ul există.' 
            });
            setIsTesting(false);
            return;
          }

          const result = await response.json();

          if (result.success) {
            setTestResult({ 
              success: true, 
              message: result.message || 'Configurația Google OAuth este validă!' 
            });
          } else {
            setTestResult({ 
              success: false, 
              message: result.message || 'Eroare la validarea configurației Google OAuth' 
            });
          }
        } catch (error: any) {
          console.error('Error testing Google OAuth:', error);
          setTestResult({ 
            success: false, 
            message: error.message || 'Eroare la testarea conexiunii Google OAuth' 
          });
        } finally {
          setIsTesting(false);
        }
      } else if (selectedModule.id === 'facebook-auth') {
        const config = {
          appId: selectedModule.config.appId || '',
          appSecret: selectedModule.config.appSecret || '',
          redirectUri: selectedModule.config.redirectUri || '',
          version: selectedModule.config.version || 'v18.0',
        };
        
        if (!config.appId || !config.appSecret) {
          setTestResult({ success: false, message: 'Completează App ID și App Secret!' });
          setIsTesting(false);
          return;
        }

        // Test connection via API route
        try {
          const response = await fetch('/api/facebook-oauth/test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              appId: config.appId,
              appSecret: config.appSecret,
              redirectUri: config.redirectUri,
              version: config.version,
            }),
          });

          // Verifică dacă răspunsul este JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            setTestResult({ 
              success: false, 
              message: 'Serverul a returnat un răspuns invalid. Verifică dacă API route-ul există.' 
            });
            setIsTesting(false);
            return;
          }

          const result = await response.json();

          if (result.success) {
            setTestResult({ 
              success: true, 
              message: result.message || 'Configurația Facebook OAuth este validă!' 
            });
          } else {
            setTestResult({ 
              success: false, 
              message: result.message || 'Eroare la validarea configurației Facebook OAuth' 
            });
          }
        } catch (error: any) {
          console.error('Error testing Facebook OAuth:', error);
          setTestResult({ 
            success: false, 
            message: error.message || 'Eroare la testarea conexiunii Facebook OAuth' 
          });
        } finally {
          setIsTesting(false);
        }
      } else if (selectedModule.id === 'resend') {
        const config = {
          apiKey: selectedModule.config.apiKey || '',
        };
        
        if (!config.apiKey) {
          setTestResult({ success: false, message: 'Completează API Key-ul!' });
          setIsTesting(false);
          return;
        }

        // Test connection via API route
        try {
          const response = await fetch('/api/resend/test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              apiKey: config.apiKey,
            }),
          });

          // Verifică dacă răspunsul este JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            setTestResult({ 
              success: false, 
              message: 'Serverul a returnat un răspuns invalid. Verifică dacă API route-ul există.' 
            });
            setIsTesting(false);
            return;
          }

          const result = await response.json();

          if (result.success) {
            setTestResult({ 
              success: true, 
              message: result.message || 'Conexiunea cu Resend este funcțională!' 
            });
          } else {
            setTestResult({ 
              success: false, 
              message: result.message || 'Eroare la validarea API Key-ului Resend' 
            });
          }
        } catch (error: any) {
          console.error('Error testing Resend:', error);
          setTestResult({ 
            success: false, 
            message: error.message || 'Eroare la testarea conexiunii Resend' 
          });
        } finally {
          setIsTesting(false);
        }
      } else if (selectedModule.id === 'google-maps') {
        const config = {
          apiKey: selectedModule.config.apiKey || '',
        };
        
        if (!config.apiKey) {
          setTestResult({ success: false, message: 'Completează API Key-ul!' });
          setIsTesting(false);
          return;
        }

        // Test connection via API route
        try {
          const response = await fetch('/api/google-maps/test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              apiKey: config.apiKey,
            }),
          });

          // Verifică dacă răspunsul este JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            setTestResult({ 
              success: false, 
              message: 'Serverul a returnat un răspuns invalid. Verifică dacă API route-ul există.' 
            });
            setIsTesting(false);
            return;
          }

          const result = await response.json();

          if (result.success) {
            setTestResult({ 
              success: true, 
              message: result.message || 'Conexiunea cu Google Maps este funcțională!',
              data: result.data
            });
          } else {
            setTestResult({ 
              success: false, 
              message: result.message || 'Eroare la validarea API Key-ului Google Maps' 
            });
          }
        } catch (error: any) {
          console.error('Error testing Google Maps:', error);
          setTestResult({ 
            success: false, 
            message: error.message || 'Eroare la testarea conexiunii Google Maps' 
          });
        } finally {
          setIsTesting(false);
        }
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Eroare la testare' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedModule) return;

    // Validare configurație în funcție de modul
    if (selectedModule.id === 'smartbill') {
      if (!selectedModule.config.username || !selectedModule.config.token || !selectedModule.config.companyVATNumber) {
        setMessage({ type: 'error', text: 'Completează toate câmpurile obligatorii!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }
    } else if (selectedModule.id === 'oblio') {
      if (!selectedModule.config.clientId || !selectedModule.config.clientSecret) {
        setMessage({ type: 'error', text: 'Completează email-ul și token-ul Oblio (Setări > Date Cont)!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }
    } else if (selectedModule.id === 'netopia') {
      // Netopia: salvare permisă parțial – poți adăuga API Key / certificate mai târziu
    } else if (selectedModule.id === 'google-auth') {
      if (!selectedModule.config.clientId || !selectedModule.config.clientSecret) {
        setMessage({ type: 'error', text: 'Completează Client ID și Client Secret!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }
    } else if (selectedModule.id === 'facebook-auth') {
      if (!selectedModule.config.appId || !selectedModule.config.appSecret) {
        setMessage({ type: 'error', text: 'Completează App ID și App Secret!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }
    } else if (selectedModule.id === 'resend') {
      if (!selectedModule.config.apiKey) {
        setMessage({ type: 'error', text: 'Completează API Key-ul!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }
    } else if (selectedModule.id === 'google-maps') {
      if (!selectedModule.config.apiKey) {
        setMessage({ type: 'error', text: 'Completează API Key-ul pentru Google Maps!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        return;
      }
    }

    // Salvează în Supabase
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin/modules/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modules: [{
            id: selectedModule.id,
            name: selectedModule.name,
            type: selectedModule.type,
            enabled: selectedModule.enabled,
            config: selectedModule.config,
            description: selectedModule.description,
            version: selectedModule.version,
          }],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Eroare la salvarea configurației');
      }

      // Update module in list
      const updatedModules = modules.map(m =>
        m.id === selectedModule.id ? selectedModule : m
      );
      setModules(updatedModules);
      
      // Salvează și în localStorage ca backup
      localStorage.setItem('admin_modules', JSON.stringify(updatedModules));
      // Pentru Oblio: cache local (dashboard-ul folosește /api/oblio/status din Admin → Module)
      if (selectedModule.id === 'oblio') {
        localStorage.setItem('oblio_config', JSON.stringify({
          configured: !!(selectedModule.config.clientId && selectedModule.config.clientSecret),
          enabled: !!selectedModule.enabled,
          cif: selectedModule.config.cif || '',
        }));
      }
      
      setMessage({ type: 'success', text: 'Configurația a fost salvată cu succes în Supabase!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      setShowConfigModal(false);
      setSelectedModule(null);
      setTestResult(null);
    } catch (error: any) {
      console.error('Error saving module config:', error);
      setMessage({ type: 'error', text: error.message || 'Eroare la salvarea configurației!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'api': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'service': return 'bg-green-100 text-green-700 border-green-200';
      case 'integration': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'api': return 'API';
      case 'service': return 'Service';
      case 'integration': return 'Integrare';
      default: return type;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-gray-900">
                Gestionare Module
              </h1>
              <p className="text-gray-600">
                Gestionează API-uri, servicii și integrări ale aplicației
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <i className="ri-add-line mr-2"></i>
              Adaugă Modul
            </button>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg shadow-lg border ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border-green-200'
              : message.type === 'info'
              ? 'bg-blue-50 text-blue-800 border-blue-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            {message.type === 'info' && (
              <div className="flex items-center gap-2 mb-2">
                <i className="ri-loader-4-line animate-spin text-blue-600"></i>
                <span className="font-semibold">Verificare în curs...</span>
              </div>
            )}
            {message.text}
          </div>
        )}

        {/* Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module) => (
            <div
              key={module.id}
              className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300"
            >
              {/* Module Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">
                    {module.name}
                  </h3>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getTypeColor(module.type)}`}>
                      {getTypeLabel(module.type)}
                    </span>
                    {module.id === 'netopia' && module.config && (
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${
                        module.config.testMode === false 
                          ? 'bg-green-100 text-green-700 border-green-200' 
                          : 'bg-amber-100 text-amber-700 border-amber-200'
                      }`}>
                        {module.config.testMode === false ? 'Live' : 'Test'}
                      </span>
                    )}
                    {module.version && (
                      <span className="text-xs text-gray-500">v{module.version}</span>
                    )}
                  </div>
                  {module.description && (
                    <p className="text-sm text-gray-600 mt-2">
                      {module.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Module Status */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${module.enabled ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                  <span className="text-sm text-gray-600">
                    {module.enabled ? 'Activat' : 'Dezactivat'}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleModule(module.id)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                    module.enabled
                      ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {module.enabled ? 'Dezactivează' : 'Activează'}
                </button>
              </div>

              {/* Module Actions */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setMessage({ type: 'info', text: 'Verific configurația modulului...' });
                      const verification = await verifyModule(module);
                      if (verification.success) {
                        setMessage({ type: 'success', text: verification.message });
                      } else {
                        setMessage({ type: 'error', text: verification.message });
                      }
                      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
                    }}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 text-sm font-medium"
                    title="Verifică configurația modulului"
                  >
                    <i className="ri-checkbox-circle-line mr-1"></i>
                    Verifică
                  </button>
                  <button
                    onClick={() => handleEditConfig(module)}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 text-sm font-medium"
                  >
                    <i className="ri-settings-3-line mr-1"></i>
                    Configurează
                  </button>
                  <button
                    onClick={() => handleDeleteModule(module.id)}
                    className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-300 text-sm font-medium"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {modules.length === 0 && (
          <div className="text-center py-12">
            <i className="ri-box-3-line text-6xl text-gray-400 mb-4"></i>
            <p className="text-gray-600 text-lg mb-2">Nu există module configurate</p>
            <p className="text-gray-500 text-sm mb-6">Adaugă un modul nou pentru a începe</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <i className="ri-add-line mr-2"></i>
              Adaugă Primul Modul
            </button>
          </div>
        )}

        {/* Add Module Modal */}
        {showAddModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddModal(false)}
          >
            <div
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Adaugă Modul Nou</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nume Modul *
                  </label>
                  <input
                    type="text"
                    value={newModule.name}
                    onChange={(e) => setNewModule({ ...newModule, name: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="ex: Stripe API, PayPal, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tip Modul *
                  </label>
                  <select
                    value={newModule.type}
                    onChange={(e) => setNewModule({ ...newModule, type: e.target.value as any })}
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="api">API</option>
                    <option value="service">Service</option>
                    <option value="integration">Integrare</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descriere
                  </label>
                  <textarea
                    value={newModule.description}
                    onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Descrierea modulului..."
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Versiune
                  </label>
                  <input
                    type="text"
                    value={newModule.version}
                    onChange={(e) => setNewModule({ ...newModule, version: e.target.value })}
                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1.0.0"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enabled"
                    checked={newModule.enabled}
                    onChange={(e) => setNewModule({ ...newModule, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <label htmlFor="enabled" className="text-sm text-gray-700">
                    Activează modulul imediat
                  </label>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-300"
                >
                  Anulează
                </button>
                <button
                  onClick={handleAddModule}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium"
                >
                  Adaugă
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Config Modal */}
        {showConfigModal && selectedModule && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowConfigModal(false)}
          >
            <div
              className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  Configurează {selectedModule.name}
                </h2>
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="text-gray-500 hover:text-gray-900 transition-colors"
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              <div className="space-y-4">
                {/* SmartBill Configuration */}
                {selectedModule.id === 'smartbill' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Username/Email SmartBill *
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.username || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, username: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="username@example.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        API Token *
                      </label>
                      <input
                        type="password"
                        value={selectedModule.config.token || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, token: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Token-ul API SmartBill"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CUI/CIF Companie *
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.companyVATNumber || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, companyVATNumber: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="RO12345678"
                      />
                    </div>
                  </>
                )}

                {/* Oblio.eu Configuration */}
                {selectedModule.id === 'oblio' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email cont Oblio (client_id) *
                      </label>
                      <input
                        type="email"
                        value={selectedModule.config.clientId || ''}
                        onChange={(e) => setSelectedModule({
                          ...selectedModule,
                          config: { ...selectedModule.config, clientId: e.target.value },
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="nume@exemplu.com"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Adresa de email cu care te autentifici pe <a href="https://www.oblio.eu/account" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline hover:text-blue-700">oblio.eu/account</a>
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Token API (client_secret) *
                      </label>
                      <input
                        type="password"
                        value={selectedModule.config.clientSecret || ''}
                        onChange={(e) => setSelectedModule({
                          ...selectedModule,
                          config: { ...selectedModule.config, clientSecret: e.target.value },
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Token din Setări > Date Cont"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Token-ul se găsește în contul Oblio: Setări → Date Cont. Se regenerează la resetarea parolei.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        CIF firmă (opțional)
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.cif || ''}
                        onChange={(e) => setSelectedModule({
                          ...selectedModule,
                          config: { ...selectedModule.config, cif: e.target.value },
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="RO12345678"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        CIF-ul firmei din care emiți facturile. Poate fi lăsat gol dacă ai o singură firmă; se poate seta și la emitere.
                      </p>
                    </div>
                  </>
                )}

                {/* PayU Payments Configuration */}
                {selectedModule.id === 'payu' && (
                  <>
                    <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm ${
                      selectedModule.config.testMode !== false ? 'bg-amber-100 border-2 border-amber-300 text-amber-700' : 'bg-green-100 border-2 border-green-300 text-green-700'
                    }`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${selectedModule.config.testMode !== false ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`}></span>
                      {selectedModule.config.testMode !== false ? 'MOD TEST (Sandbox)' : 'MOD LIVE (Producție)'}
                    </div>
                    <div className="flex rounded-xl p-1.5 gap-1 bg-gray-100 border border-gray-200">
                      <button type="button" onClick={() => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, testMode: true } })} className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold ${selectedModule.config.testMode !== false ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Test</button>
                      <button type="button" onClick={() => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, testMode: false } })} className={`flex-1 px-4 py-3 rounded-lg text-sm font-semibold ${selectedModule.config.testMode === false ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Live</button>
                    </div>
                    {selectedModule.config.testMode !== false && (
                      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-amber-700">Credentiale Test (Sandbox)</h4>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Client ID *</label><input type="text" value={selectedModule.config.clientIdTest || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, clientIdTest: e.target.value } })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" placeholder="Client ID din POS" /></div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Client Secret *</label><input type="password" value={selectedModule.config.clientSecretTest || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, clientSecretTest: e.target.value } })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" placeholder="Client Secret" /></div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Merchant POS ID *</label><input type="text" value={selectedModule.config.merchantPosIdTest || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, merchantPosIdTest: e.target.value } })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" placeholder="POS ID" /></div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Second Key (pentru semnătura IPN, opțional)</label><input type="password" value={selectedModule.config.secondKeyTest || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, secondKeyTest: e.target.value } })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" placeholder="Second key / client_secret" /></div>
                      </div>
                    )}
                    {selectedModule.config.testMode === false && (
                      <div className="rounded-lg border-2 border-green-300 bg-green-50 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-green-700">Credentiale Live</h4>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Client ID *</label><input type="text" value={selectedModule.config.clientIdLive || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, clientIdLive: e.target.value } })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" placeholder="Client ID din POS" /></div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Client Secret *</label><input type="password" value={selectedModule.config.clientSecretLive || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, clientSecretLive: e.target.value } })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" placeholder="Client Secret" /></div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Merchant POS ID *</label><input type="text" value={selectedModule.config.merchantPosIdLive || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, merchantPosIdLive: e.target.value } })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" placeholder="POS ID" /></div>
                        <div><label className="block text-xs font-medium text-gray-600 mb-1">Second Key (pentru semnătura IPN, opțional)</label><input type="password" value={selectedModule.config.secondKeyLive || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, secondKeyLive: e.target.value } })} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm" placeholder="Second key" /></div>
                      </div>
                    )}
                  </>
                )}

                {/* Netopia Payments Configuration */}
                {selectedModule.id === 'netopia' && (
                  <>
                    {/* Indicator: Modul activ */}
                    <div className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm ${
                      selectedModule.config.testMode !== false 
                        ? 'bg-amber-100 border-2 border-amber-300 text-amber-700' 
                        : 'bg-green-100 border-2 border-green-300 text-green-700'
                    }`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${selectedModule.config.testMode !== false ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`}></span>
                      {selectedModule.config.testMode !== false ? 'MOD TEST ACTIV – plăți simulate (Sandbox)' : 'MOD LIVE ACTIV – plăți reale (Producție)'}
                    </div>

                    {/* Switch Test / Live (on/off) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Mediu plată activ
                      </label>
                      <div className="flex rounded-xl p-1.5 gap-1 bg-gray-100 border border-gray-200">
                        <button
                          type="button"
                          onClick={() => setSelectedModule({ 
                            ...selectedModule, 
                            config: { ...selectedModule.config, testMode: true } 
                          })}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                            selectedModule.config.testMode !== false 
                              ? 'bg-amber-500 text-white shadow-md ring-2 ring-amber-400/50' 
                              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${selectedModule.config.testMode !== false ? 'bg-white' : 'bg-amber-500/30'}`}></span>
                          Test
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedModule({ 
                            ...selectedModule, 
                            config: { ...selectedModule.config, testMode: false } 
                          })}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${
                            selectedModule.config.testMode === false 
                              ? 'bg-green-600 text-white shadow-md ring-2 ring-green-400/50' 
                              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${selectedModule.config.testMode === false ? 'bg-white' : 'bg-green-500/30'}`}></span>
                          Live
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Test = Sandbox. Live = Producție. Când apeși Test intră pe Test, când apeși Live intră pe Live.
                      </p>
                    </div>

                    {/* Credentiale TEST – vizibile DOAR când Mod Test e activ */}
                    {selectedModule.config.testMode !== false && (
                      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                          Credentiale Mod Test (Sandbox)
                        </h4>
                        <p className="text-xs text-gray-500">Plățile nu sunt reale. Credentiale complet separate de Live.</p>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">API Key (opțional – adaugă mai târziu dacă Netopia oferă)</label>
                          <p className="text-[10px] text-gray-500 mb-0.5">Profile → Security. Opțional – fluxul cu certificate funcționează fără.</p>
                          <input
                            type="password"
                            value={selectedModule.config.apiKeyTest || ''}
                            onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, apiKeyTest: e.target.value } })}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm"
                            placeholder="API Key din Sandbox"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Semnătura (necesară pentru plăți)</label>
                          <p className="text-[10px] text-gray-500 mb-0.5">Puncte de Vânzare → click pe domeniu → „Semnătură”. Ex: 3AQO-OWWT-C6KV-NLTZ-AUEI.</p>
                          <input
                            type="text"
                            value={selectedModule.config.merchantSignatureTest || ''}
                            onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, merchantSignatureTest: e.target.value } })}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm"
                            placeholder="3AQO-OWWT-C6KV-NLTZ-AUEI"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">URL Sandbox (opțional)</label>
                          <input
                            type="text"
                            value={selectedModule.config.sandboxUrl || ''}
                            onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, sandboxUrl: e.target.value } })}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm"
                            placeholder="https://sandboxsecure.mobilpay.ro"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Public Key (Test) *</label>
                          <div className="flex gap-2 items-start">
                            <textarea rows={3} value={selectedModule.config.publicKeyTest || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, publicKeyTest: e.target.value } })} className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-xs min-h-[60px]" placeholder="-----BEGIN CERTIFICATE-----" />
                            <label className="shrink-0 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 text-xs text-gray-700">
                              <input type="file" accept=".pem,.cer,.crt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, publicKeyTest: (r.result as string)?.trim() || '' } }); r.readAsText(f); } e.target.value = ''; }} />
                              📤 Încarcă
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Private Key (Test) *</label>
                          <div className="flex gap-2 items-start">
                            <textarea rows={3} value={selectedModule.config.privateKeyTest || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, privateKeyTest: e.target.value } })} className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-xs min-h-[60px]" placeholder="-----BEGIN RSA PRIVATE KEY-----" />
                            <label className="shrink-0 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 text-xs text-gray-700">
                              <input type="file" accept=".pem,.key" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, privateKeyTest: (r.result as string)?.trim() || '' } }); r.readAsText(f); } e.target.value = ''; }} />
                              📤 Încarcă
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Credentiale LIVE – vizibile DOAR când Mod Public e activ */}
                    {selectedModule.config.testMode === false && (
                      <div className="rounded-lg border-2 border-green-300 bg-green-50 p-4 space-y-3">
                        <h4 className="text-sm font-semibold text-green-700 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-400"></span>
                          Credentiale Mod Public (Live)
                        </h4>
                        <p className="text-xs text-gray-500">Plățile sunt reale. Credentiale complet separate de Test.</p>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">API Key (opțional – adaugă mai târziu dacă Netopia oferă)</label>
                          <p className="text-[10px] text-gray-500 mb-0.5">Profile → Security. Opțional – fluxul cu certificate funcționează fără.</p>
                          <input
                            type="password"
                            value={selectedModule.config.apiKeyLive || ''}
                            onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, apiKeyLive: e.target.value } })}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm"
                            placeholder="API Key din mediul Live"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Semnătura (necesară pentru plăți cu certificate)</label>
                          <p className="text-[10px] text-gray-500 mb-0.5">Puncte de Vânzare → domeniul tău → Semnătură.</p>
                          <input
                            type="text"
                            value={selectedModule.config.merchantSignatureLive || ''}
                            onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, merchantSignatureLive: e.target.value } })}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm"
                            placeholder="Semnătura din contul Live"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">URL Live (opțional)</label>
                          <input
                            type="text"
                            value={selectedModule.config.paymentUrlLive || ''}
                            onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, paymentUrlLive: e.target.value } })}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm"
                            placeholder="https://secure.mobilpay.ro"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Public Key (Live) *</label>
                          <div className="flex gap-2 items-start">
                            <textarea rows={3} value={selectedModule.config.publicKeyLive || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, publicKeyLive: e.target.value } })} className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-xs min-h-[60px]" placeholder="-----BEGIN CERTIFICATE-----" />
                            <label className="shrink-0 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 text-xs text-gray-700">
                              <input type="file" accept=".pem,.cer,.crt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, publicKeyLive: (r.result as string)?.trim() || '' } }); r.readAsText(f); } e.target.value = ''; }} />
                              📤 Încarcă
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Private Key (Live) *</label>
                          <div className="flex gap-2 items-start">
                            <textarea rows={3} value={selectedModule.config.privateKeyLive || ''} onChange={(e) => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, privateKeyLive: e.target.value } })} className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-xs min-h-[60px]" placeholder="-----BEGIN RSA PRIVATE KEY-----" />
                            <label className="shrink-0 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 text-xs text-gray-700">
                              <input type="file" accept=".pem,.key" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setSelectedModule({ ...selectedModule, config: { ...selectedModule.config, privateKeyLive: (r.result as string)?.trim() || '' } }); r.readAsText(f); } e.target.value = ''; }} />
                              📤 Încarcă
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Google OAuth Configuration */}
                {selectedModule.id === 'google-auth' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Client ID *
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.clientId || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, clientId: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="xxxxx.apps.googleusercontent.com"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Client ID-ul obținut din Google Cloud Console
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Client Secret *
                      </label>
                      <input
                        type="password"
                        value={selectedModule.config.clientSecret || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, clientSecret: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Client Secret-ul Google"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Client Secret-ul obținut din Google Cloud Console
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Redirect URI *
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.redirectUri || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, redirectUri: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="https://example.com/auth/google/callback"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        URL-ul de redirecționare după autentificare (trebuie adăugat în Google Cloud Console)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Scopes (separate prin spațiu)
                      </label>
                      <input
                        type="text"
                        value={(selectedModule.config.scopes || ['profile', 'email']).join(' ')}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, scopes: e.target.value.split(' ').filter(s => s) } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="profile email"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Scopurile OAuth (default: profile email)
                      </p>
                    </div>
                  </>
                )}

                {/* Facebook OAuth Configuration */}
                {selectedModule.id === 'facebook-auth' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        App ID *
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.appId || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, appId: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="1234567890123456"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        App ID-ul obținut din Facebook Developers
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        App Secret *
                      </label>
                      <input
                        type="password"
                        value={selectedModule.config.appSecret || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, appSecret: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="App Secret-ul Facebook"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        App Secret-ul obținut din Facebook Developers
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Redirect URI *
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.redirectUri || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, redirectUri: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="https://example.com/auth/facebook/callback"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        URL-ul de redirecționare după autentificare (trebuie adăugat în Facebook App Settings)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Scopes (separate prin virgulă)
                      </label>
                      <input
                        type="text"
                        value={(selectedModule.config.scopes || ['email', 'public_profile']).join(',')}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, scopes: e.target.value.split(',').map(s => s.trim()).filter(s => s) } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="email,public_profile"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Scopurile OAuth (default: email,public_profile)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        API Version
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.version || 'v18.0'}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, version: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="v18.0"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Versiunea API Facebook (default: v18.0)
                      </p>
                    </div>
                  </>
                )}

                {/* Google Maps Configuration */}
                {selectedModule.id === 'google-maps' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        API Key *
                      </label>
                      <input
                        type="password"
                        value={selectedModule.config.apiKey || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, apiKey: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="AIzaSy..."
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        API Key-ul obținut din Google Cloud Console. Activează API-urile: Maps JavaScript API, Geocoding API și Places API.
                      </p>
                      <a
                        href="https://console.cloud.google.com/google/maps-apis"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-700 mt-1 inline-block"
                      >
                        Obține API Key din Google Cloud Console →
                      </a>
                    </div>
                  </>
                )}

                {/* Resend Email Configuration */}
                {selectedModule.id === 'resend' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        API Key *
                      </label>
                      <input
                        type="password"
                        value={selectedModule.config.apiKey || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, apiKey: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="re_xxxxxxxxxxxxx"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        API Key-ul obținut din contul Resend (începe cu "re_")
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        From Email (Default)
                      </label>
                      <input
                        type="email"
                        value={selectedModule.config.fromEmail || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, fromEmail: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="noreply@example.com"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Adresa email implicită pentru expediere (trebuie să fie verificată în Resend)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        From Name (Default)
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.fromName || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, fromName: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Numele Companiei"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Numele implicit pentru expedierea email-urilor
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Domain (Optional)
                      </label>
                      <input
                        type="text"
                        value={selectedModule.config.domain || ''}
                        onChange={(e) => setSelectedModule({ 
                          ...selectedModule, 
                          config: { ...selectedModule.config, domain: e.target.value } 
                        })}
                        className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="example.com"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Domeniul verificat în Resend (opțional)
                      </p>
                    </div>
                  </>
                )}

                {/* Generic JSON Configuration for other modules */}
                {selectedModule.id !== 'smartbill' && selectedModule.id !== 'oblio' && selectedModule.id !== 'payu' && selectedModule.id !== 'netopia' && selectedModule.id !== 'google-auth' && selectedModule.id !== 'facebook-auth' && selectedModule.id !== 'resend' && selectedModule.id !== 'google-maps' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Configurație JSON
                    </label>
                    <textarea
                      value={JSON.stringify(selectedModule.config, null, 2)}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setSelectedModule({ ...selectedModule, config: parsed });
                        } catch {
                          // Invalid JSON, keep editing
                        }
                      }}
                      className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={10}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Folosește format JSON pentru configurația modulului (API keys, endpoints, etc.)
                    </p>
                  </div>
                )}
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`mt-6 p-4 rounded-lg ${
                  testResult.success
                    ? 'bg-green-500/20 border border-green-400/30'
                    : 'bg-red-500/20 border border-red-400/30'
                }`}>
                  <h3 className="font-semibold mb-2 text-white">
                    {testResult.success ? '✓ Configurație Verificată' : '✗ Eroare Configurație'}
                  </h3>
                  {testResult.message && (
                    <p className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                      {testResult.message}
                    </p>
                  )}
                  {testResult.data && (
                    <pre className="mt-2 text-xs overflow-auto text-gray-700 bg-gray-50 p-3 rounded-lg">
                      {JSON.stringify(testResult.data, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowConfigModal(false);
                    setTestResult(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-300"
                >
                  Anulează
                </button>
                {(selectedModule?.id === 'smartbill' || selectedModule?.id === 'oblio' || selectedModule?.id === 'payu' || selectedModule?.id === 'netopia' || selectedModule?.id === 'google-auth' || selectedModule?.id === 'facebook-auth' || selectedModule?.id === 'resend' || selectedModule?.id === 'google-maps') && (
                  <button
                    onClick={handleTestConfig}
                    disabled={isTesting || 
                      (selectedModule.id === 'smartbill' && (!selectedModule.config.username || !selectedModule.config.token || !selectedModule.config.companyVATNumber)) ||
                      (selectedModule.id === 'oblio' && (!selectedModule.config.clientId || !selectedModule.config.clientSecret)) ||
                      (selectedModule.id === 'payu' && (
                        (selectedModule.config.testMode !== false && (!selectedModule.config.clientIdTest || !selectedModule.config.clientSecretTest || !selectedModule.config.merchantPosIdTest)) ||
                        (selectedModule.config.testMode === false && (!selectedModule.config.clientIdLive || !selectedModule.config.clientSecretLive || !selectedModule.config.merchantPosIdLive))
                      )) ||
                      (selectedModule.id === 'netopia' && (
                        (selectedModule.config.testMode !== false && (
                          !selectedModule.config.merchantSignatureTest?.trim() ||
                          !selectedModule.config.publicKeyTest?.trim() ||
                          !selectedModule.config.privateKeyTest?.trim()
                        )) ||
                        (selectedModule.config.testMode === false && (
                          !selectedModule.config.merchantSignatureLive?.trim() ||
                          !selectedModule.config.publicKeyLive?.trim() ||
                          !selectedModule.config.privateKeyLive?.trim()
                        ))
                      )) ||
                      (selectedModule.id === 'google-auth' && (!selectedModule.config.clientId || !selectedModule.config.clientSecret)) ||
                      (selectedModule.id === 'facebook-auth' && (!selectedModule.config.appId || !selectedModule.config.appSecret)) ||
                      (selectedModule.id === 'resend' && !selectedModule.config.apiKey) ||
                      (selectedModule.id === 'google-maps' && !selectedModule.config.apiKey)
                    }
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isTesting ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-1"></i>
                        Testare...
                      </>
                    ) : (
                      <>
                        <i className="ri-checkbox-circle-line mr-1"></i>
                        Testează
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={handleSaveConfig}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 font-medium"
                >
                  Salvează Configurația
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
