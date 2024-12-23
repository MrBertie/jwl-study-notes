# JWL Study Notes plugin for [Obsidian](https://obsidian.md)

Create Bible study note pages in your vault based on a JWL Manager export file **in text format**.  Creates one page per Bible book, in verse order, with a new heading per chapter. Includes a nice book information table at the beginning of each book.


# How to install

Download the [latest version](https://github.com/MrBertie/jwl-study-notes/archive/refs/heads/main.zip) from this link, and unzip it.  
You see a folder called `jwl-study-notes-main`; rename this folder as `jwl-study-notes` and then add it into your `{Obsidian Vault}/.obsidian/plugins` folder.  
Restart Obsidian and go to the *Community Plugins Settings* page to enable the plugin.

*Note: you can also click the `<>Code` button above and choose `Download.zip`*

*IMPORTANT: this plugin only works on Obsidian desktop (as it needs access to the file system).*

# How to use

1. Use the JWL Manager app to export a text file containing all your bible study notes
2. Use the Command palette to open the "JWL Study Notes" import dialog
3. Make sure the "Vault location" folder name is correct; this isthe folder in your vault where you want to store your bible study notes
4. Place the text file into this folder, and make sure the file name matches the "Exported file name" setting (including the extension, e.g. "jwlnotes.txt")
5. Click the ▷Import notes◁ button to start the import process
  1. ⚠️ Existing study notes in this folder with the same book name will be overwritten!
6. If all goes well then open the folder and check that the finished study notes are correct