---
type: bug
priority: medium
lane: standard
labels: []
blocked_by: []
related: []
touches: []
created: 2026-11-13 20:54
---

## Background
Worker dan reviewer boleh menjalankan sebagian uji saja dengan menuliskan perintahnya sendiri setelah
`--`, misalnya `k2 test <id> -- bash -c 'cd sub && npx playwright test x.spec.js'`. Papan menyusun
ulang perintah itu dari potongan-potongan kata yang diterimanya, tetapi tanda kutip yang ditulis
pemanggil tidak ikut tersusun kembali. Akibatnya perintah yang dijalankan berbeda dari yang ditulis.

Ditemukan pada 2026-11-13 oleh worker tiket 261113194301 di repo pencatat-keuangan. Ia mendapati
`cd` di dalam `bash -c '...'` tidak berlaku, lalu mengakalinya dengan menaruh perintah di berkas skrip.

## How to reproduce
1. Di repo yang punya papan kerjaan2, mulai sebuah tiket sampai worktree-nya ada, lalu buat folder `sub` di worktree itu
2. Jalankan `k2 test <id> -- sh -c 'cd sub && pwd'`
3. Lihat keluarannya

Yang tercetak adalah folder worktree, bukan `sub`. Perintah yang benar-benar dijalankan adalah
`sh -c cd sub && pwd`: `cd` berjalan di shell dalam yang langsung selesai, lalu `pwd` berjalan di
folder worktree. Baris penutupnya juga menampilkan perintah tanpa tanda kutip.

## Request
Perintah setelah `--` dijalankan persis seperti yang ditulis pemanggil, termasuk tanda kutip dan
spasi di dalam satu argumen, sehingga sebagian uji bisa dijalankan di sub-folder tanpa berkas skrip
tambahan.

## Done when
- [ ] Langkah reproduksi di atas mencetak folder `sub`, bukan folder worktree
- [ ] Argumen yang berisi spasi atau karakter khusus shell (`&&`, `|`, `$`, `;`, `'`) sampai ke perintah tanpa berubah dan tanpa dijalankan dua kali
- [ ] Perintah satu kata atau beberapa kata tanpa tanda kutip (mis. `k2 test <id> -- npm test`) tetap berjalan seperti sebelumnya
- [ ] Baris penutup `k2 test` menampilkan perintah yang dijalankan dengan tanda kutipnya, sehingga bisa disalin dan dijalankan ulang apa adanya
- [ ] Ada uji otomatis untuk ketiga kasus di atas, dan uji itu gagal bila perbaikannya dibatalkan
- [ ] Bila petunjuk worker atau reviewer menyebut cara menjalankan sebagian uji, contohnya tetap benar
