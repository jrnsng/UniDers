# UniDers
DERS TAKİP - KURULUM REHBERİ
============================

Dosyalar: index.html, style.css, script.js, supabase.sql, README.txt (hepsi aynı klasörde durmalı)

1) SUPABASE PROJESİ OLUŞTURMA
   - https://supabase.com adresine gidin, ücretsiz hesap açın (GitHub veya e-posta ile).
   - "New project" deyin. Bir isim ve veritabanı şifresi belirleyin (şifreyi saklayın),
     bölge olarak size yakın olanı (ör. Frankfurt) seçin, "Create new project" deyin.
   - Proje 1-2 dakikada hazır olur.

2) supabase.sql'İ ÇALIŞTIRMA
   - Sol menüden "SQL Editor" > "New query" seçin.
   - supabase.sql dosyasının TÜM içeriğini yapıştırın ve "Run" düğmesine basın.
   - "Success" yazısını görmelisiniz. Sol menüde "Table Editor"da courses, topics,
     study_sessions tablolarını göreceksiniz.

3) SUPABASE URL'Sİ
   - Sol altta "Project Settings" (dişli) > "API" (veya "Data API") bölümüne girin.
   - "Project URL" değerini kopyalayın (https://xxxxx.supabase.co gibi).

4) ANON / PUBLIC KEY
   - Aynı sayfada "Project API keys" altında "anon" "public" anahtarını kopyalayın.
   - (Yeni panelde "Publishable key" olarak geçebilir; o da çalışır.)
   - "service_role" anahtarını ASLA kullanmayın veya paylaşmayın.

5) BİLGİLERİ script.js'E YAZMA
   - script.js dosyasını Not Defteri gibi bir editörle açın.
   - En üstteki iki satırı değiştirin:
       const SUPABASE_URL = 'https://xxxxx.supabase.co';
       const SUPABASE_ANON_KEY = 'kopyaladığınız-anahtar';
   - Tırnakları silmeyin. Kaydedin.

6) BİLGİSAYARDA ÇALIŞTIRMA
   - En kolayı: index.html'e çift tıklayıp tarayıcıda açmak.
   - Sorun olursa klasörde terminal açıp "python -m http.server 8000" yazın ve
     tarayıcıda http://localhost:8000 adresine gidin.

7) ÜCRETSİZ HOSTİNG
   Seçenek A - Netlify (en kolayı): https://app.netlify.com/drop adresine gidin,
   "ders-takip" klasörünü sürükleyip bırakın. Size bir adres verir.
   Seçenek B - GitHub Pages: GitHub'da depo açın, dosyaları yükleyin,
   Settings > Pages > Branch: main > Save.
   Seçenek C - Cloudflare Pages: Klasörü "Direct Upload" ile yükleyin.
   Anon key'in sitede görünmesi normaldir; verileri Row Level Security korur.

8) TELEFONDA AÇMA
   - Yayınladığınız adresi telefonun tarayıcısında açın ve aynı e-posta/şifreyle girin.
   - İsterseniz: Android Chrome'da menü > "Ana ekrana ekle";
     iPhone Safari'de Paylaş > "Ana Ekrana Ekle".

9) SUPABASE AUTH AYARI
   - Sol menü "Authentication" > "Providers" (veya Sign In / Providers): "Email" açık olmalı
     (varsayılan olarak açıktır).
   - Kolay kullanım için "Confirm email" seçeneğini kapatabilirsiniz; kapalıyken
     kayıt olur olmaz giriş yapılır. Açık bırakırsanız kayıttan sonra e-postadaki
     bağlantıya tıklamanız gerekir.
   - "Authentication" > "URL Configuration" > "Site URL" alanına yayınladığınız
     adresi yazın (e-posta onayı kullanıyorsanız gerekli).

ARALIKLI TEKRAR AYARLARI
   script.js'in başındaki REVIEW_CONFIG bölümünden gün sayılarını değiştirebilirsiniz.

SORUN GİDERME
   - "Veritabanına bağlanılamadı": İnterneti, URL'yi ve anahtarı kontrol edin.
   - Kayıt/giriş çalışıyor ama veri kaydedilmiyor: supabase.sql'in hatasız
     çalıştığından emin olun.
