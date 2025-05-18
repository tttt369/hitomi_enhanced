<div align="center">
  <h1>Hitomi Enhanced</h1>
  <p>
    <a href="#english-version-eng" onclick="showSection('eng')">English</a> | 
    <a href="#日本語版-jp" onclick="showSection('jp')">日本語</a>
  </p>
</div>

![Hitomi Enhanced Banner](https://i.imgur.com/OUUI72L.png)

<div id="english-version-eng" class="language-section">
  ### Features

  - 📃 Displays the number of pages
  - ✨ Modern look and feel powered by Bootstrap
  - 📌 Automatically assigns tags to set the default query
  - 🔄 Infinite scroll functionality

  ### Installation

  This script works on any device that supports a userscript manager.

  > **Note**  
  > This script does not include ad-blocking functionality, so we recommend using an ad blocker alongside it.

  #### PC
  1. Install a Userscript Manager:
     - [Firefox](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/)
     - [Chrome](https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag)
  2. Install the Userscript:
     - [Click to install](https://gist.github.com/tttt369/f454a78a0ca65abee84cec7f155d9e4e/raw/c782142df0b0ec10d9bcf83a32b5051e10fcfc0f/my-script.user.js)
  3. Open [hitomi.la](https://hitomi.la) and refresh

  #### Android
  1. Install [Firefox with Violentmonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/)
  2. Install the Userscript using the same link above
  3. Open [hitomi.la](https://hitomi.la) and refresh

  #### iOS
  1. Install [Userscripts](https://itunes.apple.com/us/app/userscripts/id1463298887) from App Store
  2. Enable in **Settings > Safari > Extensions**
  3. Visit the [Userscript URL](https://gist.github.com/tttt369/f454a78a0ca65abee84cec7f155d9e4e/raw/c782142df0b0ec10d9bcf83a32b5051e10fcfc0f/my-script.user.js)
  4. Install via Safari extensions menu
  5. Open [hitomi.la](https://hitomi.la) and refresh
</div>

<div id="日本語版-jp" class="language-section" style="display: none;">
  ## 日本語版 (jp)

  ### 機能

  - 📃 ページ数を表示します
  - ✨ Bootstrapを使用したモダンなデザイン
  - 📌 デフォルトクエリを自動でタグ付け
  - 🔄 無限スクロール機能

  ### インストール

  このスクリプトはユーザースクリプトマネージャ対応デバイスで動作します。

  > **注意**  
  > 広告ブロック機能は含まれていないため、広告ブロッカーの併用を推奨します

  #### PC
  1. ユーザースクリプトマネージャをインストール:
     - [Firefox版](https://addons.mozilla.org/ja/firefox/addon/violentmonkey/)
     - [Chrome版](https://chromewebstore.google.com/detail/violentmonkey/jinjaccalgkegednnccohejagnlnfdag)
  2. スクリプトをインストール:
     - [こちらからインストール](https://gist.github.com/tttt369/f454a78a0ca65abee84cec7f155d9e4e/raw/c782142df0b0ec10d9bcf83a32b5051e10fcfc0f/my-script.user.js)
  3. [hitomi.la](https://hitomi.la)を開きページ更新

  #### Android
  1. [FirefoxにViolentmonkey](https://addons.mozilla.org/ja/firefox/addon/violentmonkey/)をインストール
  2. 上記と同じリンクからスクリプトをインストール
  3. [hitomi.la](https://hitomi.la)を開きページ更新

  #### iOS
  1. App Storeから[Userscripts](https://itunes.apple.com/jp/app/userscripts/id1463298887)をインストール
  2. **設定 > Safari > 拡張機能**で有効化
  3. [スクリプトURL](https://gist.github.com/tttt369/f454a78a0ca65abee84cec7f155d9e4e/raw/c782142df0b0ec10d9bcf83a32b5051e10fcfc0f/my-script.user.js)にアクセス
  4. Safari拡張機能メニューからインストール
  5. [hitomi.la](https://hitomi.la)を開きページ更新
</div>

<script>
  function showSection(lang) {
    const engSection = document.getElementById('english-version-eng');
    const jpSection = document.getElementById('日本語版-jp');
    
    if (lang === 'eng') {
      engSection.style.display = 'block';
      jpSection.style.display = 'none';
    } else if (lang === 'jp') {
      engSection.style.display = 'none';
      jpSection.style.display = 'block';
    }
  }

  // Default to English on page load
  window.onload = function() {
    showSection('eng');
  };
</script>
