-- ============================================
-- Migration: User Reviews, Chat & Counter Offers System
-- ============================================
-- Creează tabele pentru sistemul de review, chat și contra-oferte

-- Șterge trigger-ul dacă există (doar dacă tabelul există)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bids') THEN
    DROP TRIGGER IF EXISTS trigger_activate_chat_after_bid ON public.bids;
  END IF;
END $$;

-- Tabelul pentru review-uri între useri
CREATE TABLE IF NOT EXISTS public.user_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewed_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  review_type TEXT NOT NULL CHECK (review_type IN ('seller', 'buyer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reviewer_user_id, reviewed_user_id, product_id, review_type)
);

-- Indexuri pentru user_reviews
CREATE INDEX IF NOT EXISTS idx_user_reviews_reviewed_user ON public.user_reviews(reviewed_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_reviewer_user ON public.user_reviews(reviewer_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_product ON public.user_reviews(product_id);

-- Adaptare pentru chat_conversations existent - adaugă coloanele lipsă
DO $$
BEGIN
  -- Verifică dacă tabelul există
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_conversations') THEN
    -- Adaugă coloanele necesare dacă lipsesc
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'product_id') THEN
      ALTER TABLE public.chat_conversations ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'buyer_user_id') THEN
      ALTER TABLE public.chat_conversations ADD COLUMN buyer_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'seller_user_id') THEN
      ALTER TABLE public.chat_conversations ADD COLUMN seller_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'is_active') THEN
      ALTER TABLE public.chat_conversations ADD COLUMN is_active BOOLEAN DEFAULT false;
    END IF;
    
    -- Adaugă constraint UNIQUE dacă nu există
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'chat_conversations_product_buyer_seller_unique'
    ) THEN
      ALTER TABLE public.chat_conversations 
      ADD CONSTRAINT chat_conversations_product_buyer_seller_unique 
      UNIQUE (product_id, buyer_user_id, seller_user_id);
    END IF;
  ELSE
    -- Creează tabelul dacă nu există
    CREATE TABLE public.chat_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      buyer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      seller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      is_active BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(product_id, buyer_user_id, seller_user_id)
    );
  END IF;
END $$;

-- Indexuri pentru chat_conversations (doar dacă coloanele există)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'product_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_product ON public.chat_conversations(product_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'buyer_user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_buyer ON public.chat_conversations(buyer_user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'seller_user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_seller ON public.chat_conversations(seller_user_id);
  END IF;
END $$;

-- Adaptare pentru chat_messages existent - adaugă coloanele lipsă
DO $$
BEGIN
  -- Verifică dacă tabelul există
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chat_messages') THEN
    -- Adaugă sender_user_id dacă nu există (poate există deja sender_id)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'sender_user_id') THEN
      -- Verifică dacă există sender_id și îl folosește, altfel adaugă sender_user_id
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'sender_id') THEN
        -- Creează o coloană sender_user_id care să fie o copie a sender_id (doar pentru sender_type = 'user')
        ALTER TABLE public.chat_messages ADD COLUMN sender_user_id UUID;
        UPDATE public.chat_messages SET sender_user_id = sender_id::UUID WHERE sender_id IS NOT NULL AND sender_type = 'user';
        -- Nu setăm NOT NULL pentru că pot exista mesaje de la admin/ai
        ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
      ELSE
        ALTER TABLE public.chat_messages ADD COLUMN sender_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
      END IF;
    END IF;
    
    -- Adaugă message_text dacă nu există (poate există deja content)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'message_text') THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'content') THEN
        -- Creează message_text ca o copie a content
        ALTER TABLE public.chat_messages ADD COLUMN message_text TEXT;
        UPDATE public.chat_messages SET message_text = content WHERE content IS NOT NULL;
      ELSE
        ALTER TABLE public.chat_messages ADD COLUMN message_text TEXT;
      END IF;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'is_read') THEN
      ALTER TABLE public.chat_messages ADD COLUMN is_read BOOLEAN DEFAULT false;
    END IF;
  ELSE
    -- Creează tabelul dacă nu există
    CREATE TABLE public.chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
      sender_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      message_text TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

-- Indexuri pentru chat_messages (doar dacă coloanele există)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'conversation_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages(conversation_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'sender_user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON public.chat_messages(sender_user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON public.chat_messages(created_at);
  END IF;
END $$;

-- Tabelul pentru licitații/oferte
-- Verifică dacă tabelul există deja și adaugă coloanele dacă lipsesc
DO $$ 
BEGIN
  -- Creează tabelul dacă nu există
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bids') THEN
    CREATE TABLE public.bids (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      amount DECIMAL(10, 2) NOT NULL,
      is_winning BOOLEAN DEFAULT false,
      is_outbid BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    -- Adaugă coloanele dacă lipsesc
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'product_id') THEN
      ALTER TABLE public.bids ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'user_id') THEN
      ALTER TABLE public.bids ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'amount') THEN
      ALTER TABLE public.bids ADD COLUMN amount DECIMAL(10, 2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'is_winning') THEN
      ALTER TABLE public.bids ADD COLUMN is_winning BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'is_outbid') THEN
      ALTER TABLE public.bids ADD COLUMN is_outbid BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'created_at') THEN
      ALTER TABLE public.bids ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
  END IF;
END $$;

-- Indexuri pentru bids (doar dacă coloanele există)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'product_id') THEN
    CREATE INDEX IF NOT EXISTS idx_bids_product ON public.bids(product_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'user_id') THEN
    CREATE INDEX IF NOT EXISTS idx_bids_user ON public.bids(user_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bids' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_bids_created ON public.bids(created_at);
  END IF;
END $$;

-- Tabelul pentru contra-oferte
CREATE TABLE IF NOT EXISTS public.counter_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexuri pentru counter_offers
CREATE INDEX IF NOT EXISTS idx_counter_offers_product ON public.counter_offers(product_id);
CREATE INDEX IF NOT EXISTS idx_counter_offers_conversation ON public.counter_offers(conversation_id);
CREATE INDEX IF NOT EXISTS idx_counter_offers_from_user ON public.counter_offers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_counter_offers_to_user ON public.counter_offers(to_user_id);

-- RLS Policies pentru user_reviews
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_reviews') THEN
    ALTER TABLE public.user_reviews ENABLE ROW LEVEL SECURITY;
    
    -- Șterge policy-urile vechi dacă există
    DROP POLICY IF EXISTS "Users can view all reviews" ON public.user_reviews;
    DROP POLICY IF EXISTS "Users can create reviews for transactions they participated in" ON public.user_reviews;
    DROP POLICY IF EXISTS "Users can update their own reviews" ON public.user_reviews;
    
    -- Creează policy-urile noi
    CREATE POLICY "Users can view all reviews"
      ON public.user_reviews FOR SELECT
      USING (true);
    
    CREATE POLICY "Users can create reviews for transactions they participated in"
      ON public.user_reviews FOR INSERT
      WITH CHECK ((SELECT auth.uid()) = reviewer_user_id);
    
    CREATE POLICY "Users can update their own reviews"
      ON public.user_reviews FOR UPDATE
      USING ((SELECT auth.uid()) = reviewer_user_id);
  END IF;
END $$;

-- RLS Policies pentru chat_conversations (doar dacă coloanele necesare există)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'buyer_user_id') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_conversations' AND column_name = 'seller_user_id') THEN
    ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
    
    -- Șterge policy-urile vechi dacă există
    DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.chat_conversations;
    DROP POLICY IF EXISTS "Users can create conversations" ON public.chat_conversations;
    DROP POLICY IF EXISTS "Users can update conversations they are part of" ON public.chat_conversations;
    
    -- Creează policy-urile noi
    CREATE POLICY "Users can view conversations they are part of"
      ON public.chat_conversations FOR SELECT
      USING ((SELECT auth.uid()) = buyer_user_id OR (SELECT auth.uid()) = seller_user_id);
    
    CREATE POLICY "Users can create conversations"
      ON public.chat_conversations FOR INSERT
      WITH CHECK ((SELECT auth.uid()) = buyer_user_id OR (SELECT auth.uid()) = seller_user_id);
    
    CREATE POLICY "Users can update conversations they are part of"
      ON public.chat_conversations FOR UPDATE
      USING ((SELECT auth.uid()) = buyer_user_id OR (SELECT auth.uid()) = seller_user_id);
  END IF;
END $$;

-- RLS Policies pentru chat_messages (doar dacă coloanele necesare există)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_messages' AND column_name = 'sender_user_id') THEN
    ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
    
    -- Șterge policy-urile vechi dacă există
    DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.chat_messages;
    DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.chat_messages;
    DROP POLICY IF EXISTS "Users can update their own messages" ON public.chat_messages;
    
    -- Creează policy-urile noi
    CREATE POLICY "Users can view messages in their conversations"
      ON public.chat_messages FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.chat_conversations
          WHERE id = conversation_id
          AND ((SELECT auth.uid()) = buyer_user_id OR (SELECT auth.uid()) = seller_user_id)
        )
      );
    
    CREATE POLICY "Users can send messages in their conversations"
      ON public.chat_messages FOR INSERT
      WITH CHECK (
        (SELECT auth.uid()) = sender_user_id
        AND EXISTS (
          SELECT 1 FROM public.chat_conversations
          WHERE id = conversation_id
          AND ((SELECT auth.uid()) = buyer_user_id OR (SELECT auth.uid()) = seller_user_id)
          AND is_active = true
        )
      );
    
    CREATE POLICY "Users can update their own messages"
      ON public.chat_messages FOR UPDATE
      USING ((SELECT auth.uid()) = sender_user_id);
  END IF;
END $$;

-- RLS Policies pentru bids
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bids') THEN
    ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;
    
    -- Șterge policy-urile vechi dacă există
    DROP POLICY IF EXISTS "Anyone can view bids" ON public.bids;
    DROP POLICY IF EXISTS "Authenticated users can create bids" ON public.bids;
    
    -- Creează policy-urile noi
    CREATE POLICY "Anyone can view bids"
      ON public.bids FOR SELECT
      USING (true);
    
    CREATE POLICY "Authenticated users can create bids"
      ON public.bids FOR INSERT
      WITH CHECK ((SELECT auth.uid()) = user_id);
  END IF;
END $$;

-- RLS Policies pentru counter_offers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'counter_offers') THEN
    ALTER TABLE public.counter_offers ENABLE ROW LEVEL SECURITY;
    
    -- Șterge policy-urile vechi dacă există
    DROP POLICY IF EXISTS "Users can view counter offers in their conversations" ON public.counter_offers;
    DROP POLICY IF EXISTS "Users can create counter offers in their conversations" ON public.counter_offers;
    DROP POLICY IF EXISTS "Users can update counter offers they received" ON public.counter_offers;
    
    -- Creează policy-urile noi
    CREATE POLICY "Users can view counter offers in their conversations"
      ON public.counter_offers FOR SELECT
      USING (
        (SELECT auth.uid()) = from_user_id OR (SELECT auth.uid()) = to_user_id
      );
    
    CREATE POLICY "Users can create counter offers in their conversations"
      ON public.counter_offers FOR INSERT
      WITH CHECK (
        (SELECT auth.uid()) = from_user_id
        AND EXISTS (
          SELECT 1 FROM public.chat_conversations
          WHERE id = conversation_id
          AND ((SELECT auth.uid()) = buyer_user_id OR (SELECT auth.uid()) = seller_user_id)
          AND is_active = true
        )
      );
    
    CREATE POLICY "Users can update counter offers they received"
      ON public.counter_offers FOR UPDATE
      USING ((SELECT auth.uid()) = to_user_id);
  END IF;
END $$;

-- Funcție pentru a activa chat-ul după prima ofertă
-- Această funcție presupune că tabelul bids are coloana product_id
CREATE OR REPLACE FUNCTION public.activate_chat_after_bid()
RETURNS TRIGGER AS $$
BEGIN
  -- Verifică dacă product_id și user_id există și nu sunt NULL
  IF NEW.product_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    -- Activează conversația dacă există, altfel o creează
    INSERT INTO public.chat_conversations (product_id, buyer_user_id, seller_user_id, is_active)
    SELECT 
      NEW.product_id,
      NEW.user_id,
      p.user_id,
      true
    FROM public.products p
    WHERE p.id = NEW.product_id
    AND p.user_id IS NOT NULL
    AND p.user_id != NEW.user_id
    ON CONFLICT (product_id, buyer_user_id, seller_user_id)
    DO UPDATE SET is_active = true, updated_at = NOW();
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    -- Dacă coloana product_id nu există în tabelul bids, returnează NEW fără eroare
    RETURN NEW;
  WHEN OTHERS THEN
    -- Ignoră alte erori și returnează NEW
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Creează trigger-ul doar dacă tabelul bids există și are coloana product_id
-- Acest bloc rulează după ce tabelul a fost creat/modificat
DO $$
BEGIN
  -- Verifică dacă tabelul bids există
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'bids'
  ) THEN
    -- Verifică dacă coloana product_id există
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'bids' 
      AND column_name = 'product_id'
    ) THEN
      -- Șterge trigger-ul dacă există deja
      DROP TRIGGER IF EXISTS trigger_activate_chat_after_bid ON public.bids;
      
      -- Creează trigger-ul folosind EXECUTE pentru a evita erorile de compilare
      EXECUTE format('CREATE TRIGGER trigger_activate_chat_after_bid
        AFTER INSERT ON public.bids
        FOR EACH ROW
        EXECUTE FUNCTION public.activate_chat_after_bid()');
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignoră erorile la crearea trigger-ului
    RAISE NOTICE 'Could not create trigger: %', SQLERRM;
END $$;

-- Funcție pentru a calcula rating-ul mediu al unui user
CREATE OR REPLACE FUNCTION public.get_user_rating(user_uuid UUID)
RETURNS TABLE (
  avg_rating NUMERIC,
  review_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(AVG(rating)::NUMERIC(3,2), 0) as avg_rating,
    COUNT(*)::BIGINT as review_count
  FROM public.user_reviews
  WHERE reviewed_user_id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

