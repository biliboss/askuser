//! A casca desktop: uma janela que abre a tela do app e fica SEMPRE por cima.
//!
//! Ela não tem frontend próprio — carrega `ASKUSER_URL` como qualquer navegador.
//! Isso é deliberado: a tela já existe, é React, e duplicá-la aqui criaria uma
//! segunda verdade que diverge na primeira edição. O que esta janela acrescenta
//! é a única coisa que um navegador não dá: **atravessar o que estiver na
//! frente**.
//!
//! POR QUE ISSO IMPORTA. O projeto inteiro existe porque uma pergunta que espera
//! onde ninguém olha é indistinguível de trabalho em andamento. Uma aba de
//! navegador atrás de outras quinze é exatamente esse problema de novo. A janela
//! `always_on_top` é o que fecha o buraco no desktop.
//!
//!     cargo run --release        # abre em ASKUSER_URL, padrão 127.0.0.1:5311
//!
//! Não precisa estar rodando pra o app funcionar: é uma superfície a mais, não
//! uma peça do caminho.

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    let url = std::env::var("ASKUSER_URL").unwrap_or_else(|_| "http://127.0.0.1:5311".into());
    let parsed = url.parse().expect("ASKUSER_URL não é uma URL");

    tauri::Builder::default()
        .setup(move |app| {
            let janela = WebviewWindowBuilder::new(app, "askuser", WebviewUrl::External(parsed))
                .title("askuser")
                .inner_size(560.0, 420.0)
                // ALWAYS ON TOP é o motivo desta casca existir. Sem isto ela é
                // uma aba de navegador com bordas diferentes.
                .always_on_top(true)
                .center()
                .focused(true)
                .build()?;
            let _ = janela.set_focus();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("askuser: a janela não subiu");
}
