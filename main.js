/**
 * JWL Study Notes - Obsidian Plugin
 * =================================
 * Create Bible study note pages from a JWL Manager export file (csv format)
 * One page per Bible book, in verse order, heading per chapter
 *
 */

const { App, Plugin, Setting, PluginSettingTab, Modal, normalizePath } = require('obsidian');
const DEFAULT_SETTINGS = {
  sourceFile: 'jwlnotes.txt',
  workingFolder: 'Bible',
};

const Config = {
  cmdName: 'Add JWL Study Notes',
};

class JWLStudyNotesPlugin extends Plugin {
  constructor() {
    super(...arguments);
  }

  settings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'create-jwl-study-notes',
      name: Config.cmdName,
      callback: () => {
        new JWLStudyNotesModal(this.app, this).open();
      },
    });

    this.addSettingTab(new JWLStudyNotesSettingTab(this.app, this));

    console.log('%c' + this.manifest.name + ' ' + this.manifest.version +
    ' loaded', 'background-color: darkgreen; padding:4px; border-radius:4px');
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class Lib {
  /**
   *
   * @param {App} app
   * @param {Plugin} plugin
   * @param {Function} notice
   */
  static async createStudyNotes(app, plugin, notice) {
    const { readFile } = require('fs').promises;
    const location = plugin.settings.workingFolder + '/' + plugin.settings.sourceFile;
    const full_path = app.vault.adapter.getFullPath(location);

    const data = await readFile(full_path, { encoding: 'utf8' });
    let arr = data.split('\r\n');
    let have_entry = false;
    let entry = new Map();
    let note = '';
    let results = [];
    const APPENDIX = 67;

    for (line of arr) {
      if (line == '==={END}===') continue;

      // look for header rows first
      if (line.startsWith('==={')) {
        // if we start a new entry then save the previous one
        if (entry.size > 0) {
          results.push(entry);
        }
        entry = new Map();
        line
          .slice(4, -4)
          .split('}{')
          .map((e) => e.split('='))
          .forEach((e) => entry.set(e[0], e[1]));
        if (entry.has('Reference')) {
          entry.set('sort', entry.get('Reference').substring(0, 7));
        } else {
          entry.set('sort', APPENDIX + entry.get('DOC').substring(0, 5)); // use "67..." for other notes
          entry.set('BK', APPENDIX);
        }
        have_entry = true;

        // now consider note rows
      } else if (have_entry) {
        // first line is considered the TITLE
        if (!entry.has('NOTE')) {
          entry.set('TITLE', line);
          entry.set('NOTE', '');
        } else {
          // Add any other rows to the NOTE
          note = entry.get('NOTE') !== '' ? entry.get('NOTE') + '\n' + line : line;
          entry.set('NOTE', note);
        }
      }
    }

    // sort by the wt bible reference =>'bbcccvvv'
    results.sort((a, b) => {
      const refA = a.get('sort');
      const refB = b.get('sort');
      if (refA < refB) return -1;
      if (refA > refB) return 1;
      if (refA == refB) return 0;
    });

    let book = '';
    let book_no = 0;
    let chap = '';
    let verse = '';
    let content = '';
    let path = '';
    const last = results.length - 1;

    // one row per entry: BK CH VS Reference etc
    for (let [i, entry] of results.entries()) {
      book_no = Number(entry.get('BK'));
      book = Book[book_no - 1];

      // part of the appendix?
      if (book_no === APPENDIX) {
        content += `**${entry.get('HEADING')}**\n${entry.get('NOTE')}\n\n`;
      } else {
        // have we started a new chapter?
        chap = entry.get('CH');
        prev_chap = i > 0 ? results[i - 1].get('CH') : '';
        if (chap !== prev_chap) {
          content += `# ${book} ${chap} \n\n`;
        }
        // keep chapter notes at top
        verse = `${book} ${chap}:${entry.get('VS') ?? '—'}`;
        content += `**${verse}** "${entry.get('TITLE')}"\n${entry.get('NOTE')}\n\n`;
      }

      // have we finished a bible book?
      // check for last row also
      next_book_no = i < last ? Number(results[i + 1].get('BK')) : '';
      if (book_no !== next_book_no) {
        path =
          plugin.settings.workingFolder +
          '/' +
          book_no.toString().padStart(2, '00') +
          ' ' +
          book +
          '.md';
        path = normalizePath(path);
        if (book_no === APPENDIX) {
          content = `# ${book_no} ${book}\n\n${content}`;
        } else {
          content = this.bookInfo(book_no) + '\n' + content;
        }
        try {
          await app.vault.adapter.write(path, content);
          notice(path); // function to show path in ongoing Notice
          content = '';
        } catch (error) {
          console.log(error);
        }
      }
    }
  }

  /**
   * Get the Info block for the Bible book
   * @param {number} book_no
   * @param {string}
   */
  static bookInfo(book_no) {
    const info = TOC[book_no - 1].split(' | ');
    let result = `FIELD | INFO \n---- | ---- \n`;
    TOCHeader.forEach((key, i) => {
      const val = info[i];
      result += `${key} | ${val}\n`;
    });
    return result;
  }
}

class JWLStudyNotesModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    let { contentEl } = this;
    const decal = '🟥🟨🟩 ';

    new Setting(contentEl).setName(decal + 'JWL Study Notes').setHeading();

    new Setting(contentEl)
      .setName('Location of working folder')
      .setDesc('Both source text file and new study notes are stored here')
      .addText((text) =>
        text
          .setPlaceholder('Vault location')
          .setValue(this.plugin.settings.workingFolder)
          .onChange(async (value) => {
            this.plugin.settings.workingFolder = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(contentEl)
      .setName('Exported text file')
      .setDesc('Name of text file exported from JWL Manager (incl. extension)')
      .addText((text) =>
        text
          .setPlaceholder('Export file name')
          .setValue(this.plugin.settings.sourceFile)
          .onChange(async (value) => {
            this.plugin.settings.sourceFile = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(contentEl)
      .setDesc('Click to start the import process')
      .addButton((btn) => {
        btn
          .setButtonText('Import notes')
          .setCta()
          .onClick(() => {
            console.time('JWL Study Notes | Import');
            let ntc = new Notice(decal + 'Started importing JWL Study Notes...');
            Lib.createStudyNotes(this.app, this.plugin, (path) => {
              ntc.setMessage(decal + 'JWL Study Notes | ' + path);
              console.info('JWL Study Notes | Created page: ' + path);
            }).then(() => {
              ntc.hide();
              new Notice(decal + 'Bible study notes successfully imported to chosen folder', 3000);
              console.timeEnd('JWL Study Notes | Import');
            });
            this.close();
          });
      });

    // set focus on the button, timeout is needed to ensure DOM is ready
    const btn = this.contentEl.getElementsByTagName('button')[0];
    setTimeout(() => {
      btn.focus({ focusVisible: true });
    }, 0);
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

class JWLStudyNotesSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName('JWL Study Notes').setHeading();
    new Setting(containerEl)
      .setName('Location for study notes')
      .setDesc('Bible notes by book and the exported text file will be kept here')
      .addText((text) =>
        text
          .setPlaceholder('Vault location')
          .setValue(this.plugin.settings.workingFolder)
          .onChange(async (value) => {
            this.plugin.settings.workingFolder = value;
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName('Exported text file')
      .setDesc('Name of the text file exported from JWL Manager (including extension)')
      .addText((text) =>
        text
          .setPlaceholder('Export file name')
          .setValue(this.plugin.settings.sourceFile)
          .onChange(async (value) => {
            this.plugin.settings.sourceFile = value;
            await this.plugin.saveSettings();
          })
      );
  }
}

const Book = [
  'Genesis',
  'Exodus',
  'Leviticus',
  'Numbers',
  'Deuteronomy',
  'Joshua',
  'Judges',
  'Ruth',
  '1 Samuel',
  '2 Samuel',
  '1 Kings',
  '2 Kings',
  '1 Chronicles',
  '2 Chronicles',
  'Ezra',
  'Nehemiah',
  'Esther',
  'Job',
  'Psalms',
  'Proverbs',
  'Ecclesiastes',
  'Song of Solomon',
  'Isaiah',
  'Jeremiah',
  'Lamentations',
  'Ezekiel',
  'Daniel',
  'Hosea',
  'Joel',
  'Amos',
  'Obadiah',
  'Jonah',
  'Micah',
  'Nahum',
  'Habakkuk',
  'Zephaniah',
  'Haggai',
  'Zechariah',
  'Malachi',
  'Matthew',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Romans',
  '1 Corinthians',
  '2 Corinthians',
  'Galatians',
  'Ephesians',
  'Philippians',
  'Colossians',
  '1 Thessalonians',
  '2 Thessalonians',
  '1 Timothy',
  '2 Timothy',
  'Titus',
  'Philemon',
  'Hebrews',
  'James',
  '1 Peter',
  '2 Peter',
  '1 John',
  '2 John',
  '3 John',
  'Jude',
  'Revelation',
  'Appendix',
];

const TOCHeader = [
  'ORDER',
  'NAME OF BOOK',
  'WRITER(S)',
  'PLACE WRITTEN',
  'COMPLETED (B.C.E.)',
  'TIME COVERED (B.C.E.)',
  'CHAPTERS',
  'VERSES',
  'VERSE/CHAPTER',
];

const TOC = [
  '1 | Genesis | Moses | Wilderness | 1513 | “In the beginning” to 1657 | 50 | 1533 | 31',
  '2 | Exodus | Moses | Wilderness | 1512 | 1657-1512 | 40 | 1213 | 30',
  '3 | Leviticus | Moses | Wilderness | 1512 | 1 month (1512) | 27 | 859 | 32',
  '4 | Numbers | Moses | Wilderness and Plains of Moab | 1473 | 1512-1473 | 36 | 1288 | 36',
  '5 | Deuteronomy | Moses | Plains of Moab | 1473 | 2 months (1473) | 34 | 959 | 28',
  '6 | Joshua | Joshua | Canaan | c. 1450 | 1473–c. 1450 | 24 | 658 | 27',
  '7 | Judges | Samuel | Israel | c. 1100 | c. 1450–c. 1120 | 21 | 618 | 29',
  '8 | Ruth | Samuel | Israel | c. 1090 | 11 years of Judges’ rule | 4 | 85 | 21',
  '9 | 1 Samuel | Samuel; Gad; Nathan | Israel | c. 1078 | c. 1180-1078 | 31 | 810 | 26',
  '10 | 2 Samuel | Gad; Nathan | Israel | c. 1040 | 1077–c. 1040 | 24 | 695 | 29',
  '11 | 1 Kings | Jeremiah | Judah | 580 | c. 1040-911 | 22 | 816 | 37',
  '12 | 2 Kings | Jeremiah | Judah and Egypt | 580 | c. 920-580 | 25 | 719 | 29',
  '13 | 1 Chronicles | Ezra | Jerusalem (?) | c. 460 | After 1 Chronicles 9:44: c. 1077-1037 | 29 | 942 | 32',
  '14 | 2 Chronicles | Ezra | Jerusalem (?) | c. 460 | c. 1037-537 | 36 | 822 | 23',
  '15 | Ezra | Ezra | Jerusalem | c. 460 | 537–c. 467 | 10 | 280 | 28',
  '16 | Nehemiah | Nehemiah | Jerusalem | a. 443 | 456–a. 443 | 13 | 406 | 31',
  '17 | Esther | Mordecai | Shushan, Elam | c. 475 | 493–c. 475 | 10 | 167 | 17',
  '18 | Job | Moses | Wilderness | c. 1473 | Over 140 years between 1657 and 1473 | 42 | 1070 | 25',
  '19 | Psalms | David (73), Sons of Korah (11), Asaph (12), Moses, Solomon, Ethan, Hezekiah?, and others (40) |   | c. 460 |   | 150 | 2461 | 16',
  '20 | Proverbs | Solomon; Agur; Lemuel | Jerusalem | c. 717 |   | 31 | 915 | 29',
  '21 | Ecclesiastes | Solomon | Jerusalem | b. 1000 |   | 12 | 222 | 18',
  '22 | Song of Solomon | Solomon | Jerusalem | c. 1020 |   | 8 | 117 | 15',
  '23 | Isaiah | Isaiah | Jerusalem | a. 732 | c. 778–a. 732 | 66 | 1292 | 20',
  '24 | Jeremiah | Jeremiah | Judah; Egypt | 580 | 647-580 | 52 | 1364 | 26',
  '25 | Lamentations | Jeremiah | Near Jerusalem | 607 |   | 5 | 154 | 31',
  '26 | Ezekiel | Ezekiel | Babylon | c. 591 | 613–c. 591 | 48 | 1273 | 26',
  '27 | Daniel | Daniel | Babylon | c. 536 | 618–c. 536 | 12 | 357 | 30',
  '28 | Hosea | Hosea | Samaria (District) | a. 745 | b. 804–a. 745 | 14 | 197 | 14',
  '29 | Joel | Joel | Judah | c. 820 (?) |   | 3 | 73 | 24',
  '30 | Amos | Amos | Judah | c. 804 |   | 9 | 146 | 16',
  '31 | Obadiah | Obadiah |   | c. 607 |   | 1 | 21 | 21',
  '32 | Jonah | Jonah |   | c. 844 |   | 4 | 48 | 12',
  '33 | Micah | Micah | Judah | b. 717 | c. 777-717 | 7 | 105 | 15',
  '34 | Nahum | Nahum | Judah | b. 632 |   | 3 | 47 | 16',
  '35 | Habakkuk | Habakkuk | Judah | c. 628 (?) |   | 3 | 56 | 19',
  '36 | Zephaniah | Zephaniah | Judah | b. 648 |   | 3 | 53 | 18',
  '37 | Haggai | Haggai | Jerusalem rebuilt | 520 | 112 days (520) | 2 | 38 | 19',
  '38 | Zechariah | Zechariah | Jerusalem rebuilt | 518 | 520-518 | 14 | 211 | 15',
  '39 | Malachi | Malachi | Jerusalem rebuilt | a. 443 |   | 4 | 55 | 14',
  '40 | Matthew | Matthew | Palestine | c. 41 | 2 B.C.E.–33 C.E. | 28 | 1071 | 38',
  '41 | Mark | Mark | Rome | c. 60-65 | 29-33 C.E. | 16 | 678 | 42',
  '42 | Luke | Luke | Caesarea | c. 56-58 | 3 B.C.E.–33 C.E. | 24 | 1151 | 48',
  '43 | John | Apostle John | Ephesus, or near | c. 98 | After prologue, 29-33 C.E. | 21 | 879 | 42',
  '44 | Acts | Luke | Rome | c. 61 | 33–c. 61 C.E. | 28 | 1007 | 36',
  '45 | Romans | Paul | Corinth | c. 56 |   | 16 | 433 | 27',
  '46 | 1 Corinthians | Paul | Ephesus | c. 55 |   | 16 | 437 | 27',
  '47 | 2 Corinthians | Paul | Macedonia | c. 55 |   | 13 | 257 | 20',
  '48 | Galatians | Paul | Corinth or Syrian Antioch | c. 50-52 |   | 6 | 149 | 25',
  '49 | Ephesians | Paul | Rome | c. 60-61 |   | 6 | 155 | 26',
  '50 | Philippians | Paul | Rome | c. 60-61 |   | 4 | 104 | 26',
  '51 | Colossians | Paul | Rome | c. 60-61 |   | 4 | 95 | 24',
  '52 | 1 Thessalonians | Paul | Corinth | c. 50 |   | 5 | 89 | 18',
  '53 | 2 Thessalonians | Paul | Corinth | c. 51 |   | 3 | 47 | 16',
  '54 | 1 Timothy | Paul | Macedonia | c. 61-64 |   | 6 | 113 | 19',
  '55 | 2 Timothy | Paul | Rome | c. 65 |   | 4 | 83 | 21',
  '56 | Titus | Paul | Macedonia (?) | c. 61-64 |   | 3 | 46 | 15',
  '57 | Philemon | Paul | Rome | c. 60-61 |   | 1 | 25 | 25',
  '58 | Hebrews | Paul | Rome | c. 61 |   | 13 | 303 | 23',
  '59 | James | James (Jesus’ brother) | Jerusalem | b. 62 |   | 5 | 108 | 22',
  '60 | 1 Peter | Peter | Babylon | c. 62-64 |   | 5 | 105 | 21',
  '61 | 2 Peter | Peter | Babylon (?) | c. 64 |   | 3 | 61 | 20',
  '62 | 1 John | Apostle John | Ephesus, or near | c. 98 |   | 5 | 105 | 21',
  '63 | 2 John | Apostle John | Ephesus, or near | c. 98 |   | 1 | 13 | 13',
  '64 | 3 John | Apostle John | Ephesus, or near | c. 98 |   | 1 | 14 | 14',
  '65 | Jude | Jude (Jesus’ brother) | Palestine (?) | c. 65 |   | 1 | 25 | 25',
  '66 | Revelation | Apostle John | Patmos | c. 96 |   | 22 | 404 | 18',
];

module.exports = {
  default: JWLStudyNotesPlugin,
};
