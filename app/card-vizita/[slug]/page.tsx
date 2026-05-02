"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ExecutorBusinessCard from "@/components/ExecutorBusinessCard";
import UniversalHeader from "@/components/UniversalHeader";

interface ExecutorData {
  licitatorName?: string;
  licitatorAddress?: string;
  licitatorFiscalCode?: string;
  licitatorConsignmentAccount?: string;
  licitatorEmail?: string;
  licitatorPhone?: string;
  licitatorFax?: string;
  licitatorCompetence?: string;
  licitatorAvatar?: string;
}

export default function CardVizitaPage() {
  const params = useParams() || {};
  const auctionId = (params.slug ?? params["slug"] ?? "") as string;
  const [executorData, setExecutorData] = useState<ExecutorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const loadExecutorData = async () => {
      if (!auctionId) {
        setLoading(false);
        return;
      }

      try {
        // Load auction to get user_id
        const { data: productRow, error: productError } = await supabase
          .from('products')
          .select('user_id, custom_fields')
          .eq('slug', auctionId)
          .maybeSingle();

        if (productError || !productRow) {
          console.error('[CardVizita] Error loading product:', productError);
          setLoading(false);
          return;
        }

        const customFields = productRow.custom_fields || {};
        
        // Prioritize custom_fields first (public data)
        const executorDataFromCustomFields: ExecutorData = {
          licitatorName: customFields.licitator_name || customFields.licitatorName || customFields.Licitator_name || customFields['Licitator name'] || customFields['Nume licitator'] || customFields.executor_name || customFields.executorName || undefined,
          licitatorAddress: customFields.licitator_address || customFields.licitatorAddress || customFields.Licitator_address || customFields['Licitator address'] || customFields['Adresă licitator'] || customFields.executor_address || undefined,
          licitatorFiscalCode: customFields.licitator_fiscal_code || customFields.licitatorFiscalCode || customFields.Licitator_fiscal_code || customFields['Licitator fiscal code'] || customFields.CUI || customFields.cui || customFields['CUI licitator'] || undefined,
          licitatorConsignmentAccount: customFields.licitator_consignment_account || customFields.licitatorConsignmentAccount || customFields.Licitator_consignment_account || customFields['Licitator consignment account'] || customFields['Cont consignatie'] || customFields['Cont consignație'] || customFields['Cont consignatie licitator'] || undefined,
          licitatorEmail: customFields.licitator_email || customFields.licitatorEmail || customFields.Licitator_email || customFields['Licitator email'] || customFields['Email licitator'] || customFields.executor_email || undefined,
          licitatorPhone: customFields.licitator_phone || customFields.licitatorPhone || customFields.Licitator_phone || customFields['Licitator phone'] || customFields['Telefon licitator'] || customFields.executor_phone || undefined,
          licitatorFax: customFields.licitator_fax || customFields.licitatorFax || customFields.Licitator_fax || customFields['Licitator fax'] || customFields['Fax licitator'] || undefined,
          licitatorCompetence: customFields.licitator_competence || customFields.licitatorCompetence || customFields.Licitator_competence || customFields['Licitator competence'] || customFields['Competență licitator'] || customFields.competenta || undefined,
          licitatorAvatar: customFields.avatar_url || customFields.avatarUrl || customFields.avatar || undefined,
        };

        const hasCustomFieldsData = Object.values(executorDataFromCustomFields).some(val => val !== undefined && val !== null && val !== '');

        if (hasCustomFieldsData) {
          setExecutorData(executorDataFromCustomFields);
        } else if (productRow.user_id) {
          // Fallback to user_profiles if custom_fields is empty
          const { data: executorProfile, error: executorError } = await supabase
            .from('user_profiles')
            .select('licitator_name, licitator_address, licitator_fiscal_code, licitator_consignment_account, licitator_email, licitator_phone, licitator_fax, licitator_competence, avatar_url')
            .eq('user_id', productRow.user_id)
            .maybeSingle();

          if (executorProfile) {
            const executorDataToSet: ExecutorData = {
              licitatorName: executorProfile.licitator_name || undefined,
              licitatorAddress: executorProfile.licitator_address || undefined,
              licitatorFiscalCode: executorProfile.licitator_fiscal_code || undefined,
              licitatorConsignmentAccount: executorProfile.licitator_consignment_account || undefined,
              licitatorEmail: executorProfile.licitator_email || undefined,
              licitatorPhone: executorProfile.licitator_phone || undefined,
              licitatorFax: executorProfile.licitator_fax || undefined,
              licitatorCompetence: executorProfile.licitator_competence || undefined,
              licitatorAvatar: executorProfile.avatar_url || undefined,
            };

            const hasAnyData = Object.values(executorDataToSet).some(val => val !== undefined && val !== null && val !== '');
            if (hasAnyData) {
              setExecutorData(executorDataToSet);
            }
          }
        }
      } catch (error) {
        console.error('[CardVizita] Error loading executor data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadExecutorData();
  }, [auctionId]);

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <div className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Se încarcă...</div>
      </div>
    );
  }

  if (!executorData || (!executorData.licitatorName && !executorData.licitatorEmail && !executorData.licitatorPhone)) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${
        isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
      }`}>
        <div className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Cardul de vizită nu este disponibil.</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />
      <div className="flex items-center justify-center p-4 pt-24">
        <div className="w-full max-w-2xl">
          <ExecutorBusinessCard executorData={executorData} auctionId={auctionId} isDarkMode={isDarkMode} />
        </div>
      </div>
    </div>
  );
}

