{{--
  SNIPPET login — Fase 3 (log-only). Dua potongan, letakkan dengan tangan
  supaya tidak ada view yang tertimpa otomatis:

  1) Di DALAM <form> login yang sudah ada, tambahkan SATU baris ini
     (di dekat @csrf):

       <input type="hidden" name="bot_signal" id="bot_signal" value="">

  2) Sebelum </body> di view login yang sama (atau di layout auth-nya),
     tambahkan:

       <script src="{{ asset('js/bot-collector.js') }}" defer></script>

  Tidak ada perubahan lain di view. Collector mengisi field itu tepat
  sebelum submit; bila JS mati di browser pengguna, field terkirim
  kosong dan middleware hanya mencatat skor sinyal server — login
  pengguna asli tetap berjalan normal.
--}}
