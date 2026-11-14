# Otel hattı: nasıl çalışır

Amaç: 14 niş kategoride dünyadaki gerçek otelleri bulmak ve sizin onayınızla siteye eklemek.
Sizin tek işiniz **onay kuyruğu sayfasında karar vermek**:
https://claude.ai/artifact/WC5XfcRYrJmXf8aqCCfDz7

Güncel durum (kim nerede bekliyor, hangi aşama hata verdi): [`data/pipeline/STATUS.md`](../../data/pipeline/STATUS.md).

## Günlük döngü

| Saat (UTC) | Kim | Ne yapar | Dosya |
|---|---|---|---|
| Gece (fiilen ~07:30) | GitHub Actions, ücretsiz | Dünkü Haiku kararlarını kuyruğa işler, yeni aday bulur, ülke/konum doldurur, sıradaki 150 adayın sitesini ve Wikipedia metnini indirir, durum raporunu yazar | `.github/workflows/hotel-pipeline.yml` |
| ~10:15 | Claude Routine "classifier" | Kararlarınızı kuyruğa yazar; indirilen siteleri Haiku alt ajanlarına okutur; niş olanları onay kuyruğuna koyar; onay sayfasını günceller; sitesi olmayan 20 aday için web araması yapar | `docs/pipeline/CLASSIFIER.md` |
| Gün içinde | **Siz** | Onay kuyruğunda: Yayınla / Reddet / Araştırılsın / kategoriyi değiştir | onay kuyruğu sayfası |
| ~12:45 | Claude Routine "writer" | Onayladıklarınızın sayfasını yazar (5 dil çevirisiyle), PR açar, birleştirir; Netlify yayınlar | `docs/pipeline/WRITER.md` |

## Bir adayın yolu

```
keşif (OSM, Wikidata)            new
ucuz ön eleme                    verified / weak        (elenen: rejected, duplicate)
  sitesi yoksa: web araması      -> site bulunursa kanıt sırasına girer
kanıt paketi (site + Wikipedia)  pipeline-data dalı
Haiku sınıflandırma              classified             (niş değilse: rejected)
SİZ: onay kuyruğu                approved / rejected / "araştırılsın" (kanıt yenilenir, tekrar gelir)
yazar                            published              sayfa yayında
                                 drafted                sayfa taslak; siz "yayınla" deyince açılır
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
| **Yayınla** | Ertesi gün yazar sayfayı yazar. Kategori yanlışsa önce "Kategoriyi değiştir" kutusundan seçin. |
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
  `node pipeline/publish-drafts.mjs <slug> ...`, derleme kontrolleri, PR.

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
| `status.mjs` | `STATUS.md` |
