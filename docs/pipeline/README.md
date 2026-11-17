# Otel hattı: nasıl çalışır

Amaç: 14 niş kategoride dünyadaki gerçek otelleri bulmak ve sizin onayınızla siteye eklemek.
Sizin tek işiniz haftada bir **kısa listeden numaralarla onay vermek** (aşağıda "Haftada beş dakika"):
https://claude.ai/artifact/WC5XfcRYrJmXf8aqCCfDz7

Güncel durum (kim nerede bekliyor, hangi aşama hata verdi): [`data/pipeline/STATUS.md`](../../data/pipeline/STATUS.md).

## Haftada beş dakika: ne yapmanız gerekiyor

Kuyruktaki yüzlerce adayı tek tek okumanız gerekmiyor. Hat sizin yerinize eler, sıralar ve her hafta
size **40 otellik bir kısa liste** getirir. Sizin işiniz haftada bir kez numara yazmak.

**1. Pazartesi (2 dakika): kısa listeye bakın.** Onay sayfasının en üstünde
(https://claude.ai/artifact/WC5XfcRYrJmXf8aqCCfDz7) ya da [`STATUS.md`](../../data/pipeline/STATUS.md)
dosyasının başında "Bu haftanın kısa listesi" var. Her satırda: numara, otel, yer, kategori, niş
özelliği tek cümleyle, kaynağı (tıklayıp bakabilirsiniz) ve komisyonlu bağlantı olup olmadığı.

**2. Onay (1 dakika): numaraları tek seferde yazın.** Sayfadaki kutuya, ör. `1 3 5-9 12`, yazıp
**Onayla**'ya basın; sayfa kimleri onaylayacağını gösterir, doğruysa bir kez daha basın. Ya da bir Claude
oturumuna "kısa liste onay: 1 3 5-9 12" yazın. Yazmadığınız numaralar kuyrukta kalır; hiçbir şey
reddedilmez.

**3. Ertesi gün: taslaklar hazır.** Yazar onayladıklarınızın sayfasını 6 dilde **taslak** olarak yazar.
Taslak sitede görünmez. `STATUS.md`'de "Taslak sayfası hazır" satırında sayılarını görürsünüz.

**4. Yayın (1 dakika): "yayınla" deyin.** Bir Claude oturumuna "şu taslakları yayınla: …" ya da
"hazır taslakların hepsini yayınla" yazın. Sizin bu sözünüz olmadan hiçbir otel siteye çıkmaz.

**5. Ayda bir (1 dakika): `STATUS.md`'de "Aylık yeniden kontrol" bölümüne bakın.** Sitesi açılmayan,
kapandığını yazan ya da Expedia bağlantısı bozulan oteller orada listelenir. Hiçbiri otomatik olarak
yayından kalkmaz; kaldırılsın isterseniz Claude'a söyleyin.

Başka hiçbir şey yapmanız gerekmiyor. İsterseniz onay sayfasında kartlara tek tek de karar verebilirsiniz.

### Sizin yerinize ne yapılıyor

- **Otomatik ön eleme** (her gece): 14 kategoriden hiçbirine uymayanlar, niş özelliği kaynakta
  kanıtlanamayanlar, yalnızca adında niş olanlar, kalıcı olarak kapananlar ve tekrar kayıtlar elenir;
  kanıtı zayıf olanlar "araştırılsın"a gider. Her birinin tek cümlelik nedeni onay sayfasında yazar
  ("Reddettiklerim" ve "Araştırılsın" sekmeleri); yanlış bulursanız oradan yine onaylayabilirsiniz.
  Kurallar, 15 Kasım'da elle yapılan ön elemeyle 621 kararın 604'ünde aynı sonucu veriyor.
- **Sıralama**: tamamı niş olanlar önce; Haiku'nun güveni; nişin otelin kendi sitesinde yazması;
  sitede az oteli olan kategoriler önce; Expedia'da tam sayfası (komisyonlu bağlantı) olanlar önce.
  Bir kategoriden en fazla 10 otel.
- **Tekrar bulma**: aynı harita kaydı, aynı resmi site, aynı isim ya da çok yakın konum. Her otelin
  adı değişse de değişmeyen bir iç kimliği var (`sn-…`). Bulunanlar: [`DUPLICATES.md`](../../data/pipeline/DUPLICATES.md).
- **Aylık kontrol**: yayındaki her otelin resmi sitesi açılıyor mu, kapandığını yazıyor mu, Expedia
  bağlantısı geçerli mi.
- **Canlı yayın kontrolü** (her gece): son site değişikliği gerçekten canlıya çıktı mı; sonuç `STATUS.md`'nin ilk satırında.

## Günlük döngü

| Saat (UTC) | Kim | Ne yapar | Dosya |
|---|---|---|---|
| Gece (fiilen ~07:30) | GitHub Actions, ücretsiz | Dünkü Haiku kararlarını kuyruğa işler, yeni aday bulur, ülke/konum doldurur, tekrarları bulur, ön elemeyi yapar, sıradaki 150 adayın sitesini ve Wikipedia metnini indirir, ayda bir yayındaki otelleri kontrol eder, canlı yayını kontrol eder, durum raporunu yazar | `.github/workflows/hotel-pipeline.yml` |
| ~10:15 | Claude Routine "classifier" | Kararlarınızı kuyruğa yazar; indirilen siteleri Haiku alt ajanlarına okutur; ön elemeden geçenleri onay kuyruğuna koyar; onay sayfasını günceller; pazartesi kısa listeyi (Expedia kontrolüyle) hazırlar; sitesi olmayan 20 aday için web araması yapar | `docs/pipeline/CLASSIFIER.md` |
| Haftada bir | **Siz** | Kısa listeden numaraları onaylarsınız; ertesi gün "yayınla" dersiniz | onay sayfası / Claude |
| ~12:45 | Claude Routine "writer" | Onayladıklarınızın sayfasını 5 dil çevirisiyle **taslak** olarak yazar; siz "yayınla" deyince yayınlar | `docs/pipeline/WRITER.md` |

## Bir adayın yolu

```
keşif (OSM, Wikidata)            new
ucuz ön eleme, tekrar bulma      verified / weak        (elenen: rejected, duplicate)
  sitesi yoksa: web araması      -> site bulunursa kanıt sırasına girer
kanıt paketi (site + Wikipedia)  pipeline-data dalı
Haiku sınıflandırma              classified             (niş değilse: rejected)
otomatik ön eleme                classified             (elenen: rejected, nedeniyle; zayıf kanıt: araştırılsın)
haftalık kısa liste (40)         classified             sıralı, numaralı
SİZ: numaralarla onay            approved / rejected / "araştırılsın" (kanıt yenilenir, tekrar gelir)
yazar                            drafted                sayfa 6 dilde taslak; siz "yayınla" deyince açılır
SİZ: "yayınla"                   published              sayfa yayında
                                 blocked                dürüstçe yazılamadı (nedeni onay sayfasında)
```

Hiçbir aday sessizce bir yerde kalmaz: `STATUS.md` her aşamada kaç aday beklediğini, nedenini ve
her aşamanın son çalışmasını gösterir.

## Durumlar (`data/pipeline/candidates.json`)

| Durum | Anlamı | Sıradaki adım | Kim |
|---|---|---|---|
| `new` | Yeni bulundu | Ön eleme | Gece işi |
| `verified` / `weak` | Ön elemeyi geçti (güçlü / zayıf işaret) | Kanıt indirme; sitesi yoksa önce web araması | Gece işi / classifier |
| `classified` | Haiku niş buldu | **Sizin kararınız** | Siz |
| `approved` | Onayladınız | Sayfanın yazılması | Writer |
| `blocked` | Onaylı, ama eldeki bilgiyle yazılamadı | Yeni kanıt (3 deneme) ya da sizin kararınız | Gece işi / siz |
| `drafted` | Sayfası taslak olarak yazıldı | "Yayınla" demeniz | Siz |
| `published` | Yayında | – | – |
| `rejected`, `duplicate` | Elendi / zaten var | – | – |

## Onay kuyruğu sayfası

Her aday için: ad, yer, önerilen kategori, güven yüzdesi, kaynaktan birebir alıntı ve kaynağın
adresi, olası tekrar uyarısı (aynı isim, aynı site ya da 150 m içinde başka bir kayıt), resmi site /
harita / Wikipedia bağlantıları.

| Düğme | Sonuç |
|---|---|
| **Yayınla** | Ertesi gün yazar sayfayı 6 dilde taslak olarak yazar; siz "yayınla" deyince siteye açılır. Kategori yanlışsa önce "Kategoriyi değiştir" kutusundan seçin. |
| **Reddet** | Aday elenir, tekrar gelmez. |
| **Araştırılsın** | O gece otelin sitesi ve Wikipedia metni yeniden indirilir, Haiku notunuzu sorusu olarak alıp tekrar okur, kart yeni gerekçeyle "Onay bekliyor"a döner. Okunacak kaynak bulunamazsa kartta bu yazar. |

Sekmeler: Onay bekliyor, Onayladıklarım, **Yazılamadı** (onayladınız ama sayfa yazılamadı, nedeniyle),
Araştırılsın, Reddettiklerim, Yayında. Toplu onay düğmesi tekrar uyarısı olan kartları atlar.

Sayfanın kaynağı repoda: `pipeline/review-page/index.html`. Değiştirildiğinde aynı adrese yeniden
yayınlanır (bir Claude oturumu yapar).

## Kurallar

- Haiku sadece kanıt paketindeki metinden (otelin kendi sitesi, Wikipedia) karar verir; her iddia
  için birebir alıntı verir ve `pipeline/check-decisions.mjs` alıntıyı metinde bulamazsa o bilgiyi siler.
- Web araması sadece otelin resmi sitesini bulmak içindir; arama sonuçları otel bilgisi sayılmaz.
  Aramayla bulunan site onay kartında "Web sitesi aramayla bulundu" diye işaretlenir.
- Siz onaylamadan hiçbir otel yayınlanmaz.
- Yazar yeterli kanıt yoksa sayfa yazmaz; adayı `blocked` yapar ve nedenini yazar.
- Fiyat sadece gözlenmişse yazılır, yoksa "Rates vary". Puan ve yorum sayısı uydurulmaz.

## Dayanıklılık: ne bozulursa ne olur

| Olay | Sonuç |
|---|---|
| Gece işinde bir aşama hata verir (ör. harita servisi cevap vermez) | Diğer aşamalar çalışır, başarılı olanlar kaydedilir, çalışma "başarısız" görünür ve `STATUS.md` "Dikkat" bölümünde hangi aşama olduğu yazar. |
| Gece işi ile bir Claude oturumu kuyruğu aynı anda değiştirir | `pipeline/merge-queue.mjs` iki tarafı aday aday birleştirir; çakışmada sizin kararlarınız ve yazarın sonuçları kazanır. |
| Kanıt dalı indirilemez | Gece işi durur; boş klasör asla gerçek kanıtların üzerine yazılmaz. Paket sayısı açıklanamayan biçimde düşerse de yazılmaz. |
| Kanıt indirildi ama paketi kayboldu | Sonraki gece yeniden indirilir. |
| Haiku'nun bir karar dosyası bozuk | O dosya atlanır ve raporlanır; paketleri ertesi gün yeniden sınıflandırılır. |
| Classifier ya da writer oturumu yarıda kalır | Her adım tekrar çalıştırılabilir; hiçbir şey iki kez uygulanmaz. Onay sayfası bir sonraki classifier çalışmasında kuyrukla eşitlenir. |
| Site 3 denemede de okunamaz | Aday nedeni kaydedilerek elenir. |

## Neden kuyruk dosyası ana dalda duruyor?

`candidates.json` 7,4 MB. Başka bir dala taşımayı ya da parçalamayı değerlendirdik, yapmadık:

- Site derlemesi bu dosyayı okumuyor; Netlify sadece `data/pipeline` değişen commit'lerde derleme yapmıyor.
- Git bu dosyanın sürümlerini fark olarak saklıyor: son 29 sürümün toplamı depoda 2,3 MB.
- Dosya, onaylarınızın tek kaydı ve geçmişi. Kanıt dalı (`pipeline-data`) her gece silinip yeniden
  yazıldığı için oraya taşımak bu geçmişi yok ederdi; üç ayrı işin (gece işi, classifier, writer)
  okuduğu yolu değiştirmek de yeni kırılma noktaları açardı.

Asıl risk olan eşzamanlı yazma, birleştirme betiğiyle çözüldü.

## Elle çalıştırma

- Gece işini hemen çalıştırmak: GitHub → Actions → "Hotel pipeline (nightly)" → Run workflow.
  `evidence_count`: kaç site indirilecek; `evidence_ids`: önce indirilecek aday kimlikleri;
  `skip_discover: true`: sadece kararları işle ve kanıt indir.
- Taslakları yayınlamak: `node pipeline/publish-drafts.mjs --list`, sonra
  `node pipeline/publish-drafts.mjs <slug> ...`, `node pipeline/gate-publish.mjs <slug> ...`, PR.
  Yeni taslakların çevirisi hazırdır; eski taslaklar için betik eksik çevirileri listeler.
  Bunu bir Claude oturumuna "şu taslakları yayınla" demeniz yeterli.

## Betikler (`pipeline/`)

| Betik | İş |
|---|---|
| `discover.mjs`, `verify.mjs` | Aday bulma, ucuz ön eleme |
| `evidence.mjs` | Kanıt paketi indirme (önce sizin "araştırılsın" dedikleriniz ve yazılamayanlar) |
| `next-batches.mjs`, `check-decisions.mjs`, `apply-decisions.mjs` | Haiku'ya iş verme, alıntı doğrulama, kararı kuyruğa işleme |
| `sync-reviews.mjs`, `review-items.mjs` | Onay sayfası → kuyruk, kuyruk → onay sayfası |
| `needs-website.mjs`, `apply-websites.mjs` | Sitesi olmayan adaylar için web araması listesi ve sonucun denetimi |
| `approved.mjs`, `writer-result.mjs`, `publish-drafts.mjs` | Yazarın iş listesi, sonucu, taslağı yayına alma |
| `merge-queue.mjs` | Eşzamanlı kuyruk değişikliklerini birleştirme |
| `dedupe.mjs`, `identity.mjs` | Değişmeyen iç kimlik (`sn-…`) ve tekrar bulma; sonuç `DUPLICATES.md` |
| `prescreen.mjs`, `screen.mjs` | Otomatik ön eleme ve sıralama kuralları (CLASSIFIER.md, "Pre-screen rules") |
| `shortlist.mjs`, `shortlist-approve.mjs` | Haftalık 40'lık liste; numaralarla onay |
| `expedia-check.mjs` | Adayların tam Expedia sayfası (yalnızca arama sonucuyla doğrulanır, adres uydurulmaz) |
| `recheck.mjs` | Yayındaki otellerin aylık kontrolü (hiçbir şeyi yayından kaldırmaz) |
| `deploy-check.mjs` | Son site değişikliği canlıya çıktı mı |
| `status.mjs` | `STATUS.md` |
