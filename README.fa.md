<div align="center">

# 🩺 Repo Doctor

**بفهم چرا ریپوی متن‌بازت هنوز آماده نیست — و درستش کن.**

یک ابزار خط فرمان بدون هیچ وابستگی که مستندات، امنیت، وابستگی‌ها، کیفیت کد،
داکر، CI و آمادگی جامعه را بررسی می‌کند و در پایان diff قابل اعمال تحویل می‌دهد.

[![CI](https://github.com/pooria683/repo-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/pooria683/repo-doctor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[انگلیسی](README.md) · [سریع شروع](#سریع-شروع) · [چه چیزهایی را بررسی می‌کند](#چه-چیزهایی-را-بررسی-می‌کند) · [نقشه‌راه](docs/roadmap.fa.md)

</div>

---

```console
$ npx repo-doctor scan .

  Repo Doctor  my-project

  Health   62/100  (C)   218 files · 58 rules · 92ms

  Documentation    ███████████░░░░░░░░░  55
  Security         ██████████████░░░░░░  71
  Dependencies     █████████████████░░░  85
  CI / automation  ████████████░░░░░░░░  61

  ✖ HIGH (3)
    Possible AWS access key ID committed  src/config.ts:12
      security/committed-secret — AWS access key ID found in src/config.ts:12 (tracked by git).
    No continuous integration workflow
      ci/workflow-missing — No CI configuration was found.

  3 safe fixes available → npx repo-doctor fix --dry-run
```

## چرا یک ابزار دیگر؟

هر ابزار موجود یک تکه از مسئله را حل می‌کند: اسکنر رمز، رمز پیدا می‌کند؛
`npm audit` آسیب‌پذیری؛ linter استایل. هیچ‌کدام به سؤال واقعی نگه‌دارنده جواب
نمی‌دهند: «آیا این ریپو آماده‌ی انتشار و نگه‌داری است؟» و تقریباً هیچ‌کدام نمی‌گویند
قدم بعدی چیست.

Repo Doctor کل سطح آمادگی را در یک اجرا می‌بیند، امتیاز می‌دهد و **اصلاح پیشنهادی**
تولید می‌کند — نه دیوار هشدار.

سه انتخاب طراحی که آگاهانه است:

1. **صفر وابستگی اجرایی.** `dependencies: {}`. ابزاری که زنجیره‌ی تأمین شما را
   بررسی می‌کند نباید خودش زنجیره داشته باشد.
2. **هیچ دسترسی شبکه‌ای، هیچ‌گاه.** نه lookup رجیستری، نه تلمتری، نه توکن GitHub.
   داده‌ی مشورتی به‌صورت snapshot قابل حسابرسی همراه ابزار می‌آید.
3. **اصلاحات غیرمخرب.** `fix --apply` فقط فایل‌های جدید می‌سازد؛ هرگز چیزی که
   نوشته‌اید را تغییر نمی‌دهد، بازنویسی نمی‌کند و حذف نمی‌کند.

## سریع شروع

```bash
# بدون نصب
npx repo-doctor scan .

# یا نصب
npm install -g repo-doctor
repo-doctor scan .
```

اسکافولد هم می‌خواهید:

```bash
repo-doctor fix --dry-run    # ببین دقیقاً چه فایلی ساخته می‌شود
repo-doctor fix --apply      # بنویس
repo-doctor init . --name my-lib --owner my-handle --license MIT
```

`init` روی یک پوشه‌ی خالی، ریپویی می‌سازد که از همان اول **۹۷ از ۱۰۰** می‌گیرد.

## چه چیزهایی را بررسی می‌کند

۵۸ قاعده در هفت دسته. جزئیات کامل هر قاعده (منطق تشخیص، دلیل، اصلاح و
false positive) در [`docs/rules.md`](docs/rules.md) آمده است.

| دسته | تعداد | نمونه‌ها |
| ---- | :---: | -------- |
| 📚 مستندات | ۱۱ | کیفیت و بخش‌های README، LICENSE (و ناسازگاری با manifest)، CONTRIBUTING، CODE_OF_CONDUCT، SECURITY، CHANGELOG، قالب issue/PR |
| 🔐 امنیت | ۷ | بیش از ۲۰ الگوی رمز، کلید خصوصی، فایل `.env` ترک‌شده، پوشش `.gitignore`، dump داده |
| 📦 وابستگی‌ها | ۱۰ | lockfile، بازه‌های آسیب‌پذیر شناخته‌شده، پکیج‌های منسوخ، نسخه‌های wildcard، requirementهای unpinned، اسکریپت نصب |
| 🧪 کیفیت کد | ۱۰ | تست، اسکریپت تست، lint، formatter، strict بودن TypeScript، `.editorconfig`، فایل بزرگ |
| 🐳 کانتینر | ۸ | اجرا با root، ایمیج بدون نسخه، `curl \| sh`، رمز در `ENV`، `ADD <url>`، بهداشت apt، `.dockerignore`، Compose privileged |
| ⚙️ CI | ۷ | نبود pipeline، اکشن pin نشده، مجوز توکن، تزریق در اسکریپت، سوءاستفاده از `pull_request_target`، Dependabot، CodeQL |
| 🤝 جامعه | ۵ | مسیر good-first-issue، CODEOWNERS، حمایت مالی، حاکمیت، ترایاژ issue |

### مدل شدت

| شدت | معنا | نمونه |
| --- | ---- | ----- |
| **Critical** | امنیتی و قابل بهره‌برداری، یا مانع حقوقی. قبل از انتشار رفع کن. | کلید AWS زنده در فایل ترک‌شده |
| **High** | ریسک واقعی یا مانع سخت برای کاربر/مشارکت‌کننده. همین هفته. | نبود لایسنس، نبود CI |
| **Medium** | پذیرش را کند می‌کند یا باگ را پنهان می‌کند. برنامه‌ریزی کن. | نبود CONTRIBUTING |
| **Low** | بهداشت و پرداخت. دسته‌ای انجام بده. | نبود `.editorconfig` |
| **Info** | زمینه، نه مشکل. | نبود CodeQL |

امتیاز قابل توضیح است: هر دسته از ۱۰۰ شروع می‌کند و به‌اندازه‌ی
`وزن شدت × min(تعداد, ۳)` برای هر قاعده‌ی خطادار کم می‌شود (critical 40،
high 15، medium 6، low 2). امتیاز کل، میانگین وزنی دسته‌ها است. هیچ جادوی
پنهانی نیست و `repo-doctor rules` دقیقاً نشان می‌دهد چه چیزی می‌تواند فعال شود.

## دستورها

| دستور | کار |
| ----- | --- |
| `repo-doctor scan [path]` | اسکن و گزارش. `--format console\|markdown\|json\|sarif`، `--fail-on`، `--save` |
| `repo-doctor fix [path]` | پیش‌نمایش (`--dry-run`، پیش‌فرض) یا نوشتن (`--apply`) اصلاحات امن |
| `repo-doctor report` | رندر دوباره‌ی نتیجه‌ی ذخیره‌شده: `--from .repo-doctor/report.json --format sarif` |
| `repo-doctor init [path]` | ساخت مستندات، فایل‌های جامعه، CI و config |
| `repo-doctor rules` | فهرست قواعد یا `--validate` |

مرجع کامل: [`docs/cli.md`](docs/cli.md).

### در CI

```yaml
- name: Repo Doctor
  run: npx repo-doctor scan . --format markdown --fail-on high
```

خروجی SARIF را می‌توان به GitHub Code Scanning داد تا findingها داخل PR دیده شوند:

```yaml
permissions:
  contents: read
  security-events: write
jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx repo-doctor scan . --format sarif --output repo-doctor.sarif
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: repo-doctor.sarif }
```

کدهای خروج: `0` تمیز، `1` یافته در سطح `--fail-on` یا بالاتر، `2` استفاده‌ی
نادرست، `3` خطای غیرمنتظره.

### برای agentهای کدنویس

گزارش JSON رابط ماشینی است — schema پایدار، شناسه‌های ثابت و متادیتای اصلاح:

```json
{
  "schemaVersion": "1.0.0",
  "summary": { "score": 62, "grade": "C" },
  "findings": [
    {
      "ruleId": "security/committed-secret",
      "severity": "critical",
      "file": "src/config.ts",
      "line": 12,
      "evidence": "AKIA******** (20 chars, sha256:3f1c9a02)",
      "suggestion": "Rotate the credential now …",
      "fix": { "id": "add-gitignore", "kind": "create-file", "safe": true }
    }
  ]
}
```

جزئیات: [`docs/report-format.md`](docs/report-format.md) و
[`docs/agents.md`](docs/agents.md).

## حریم خصوصی به‌صورت طراحی‌شده

- **هیچ درخواست شبکه‌ای.** در سورس نه `http`، نه `https`، نه `net` و نه `fetch`
  وجود دارد؛ یک تست اگر روزی اضافه شود build را fail می‌کند.
- **هیچ تلمتری، هیچ حساب، هیچ توکن GitHub.** روی هر پوشه‌ای کار می‌کند، با یا
  بدون remote، روی ماشین‌های air-gapped.
- **رمزها هرگز از اسکنر خارج نمی‌شوند.** در گزارش فقط نشانه‌ی ماسک‌شده و
  fingerprint کوتاه SHA-256 هست: `AKIA******** (20 chars, sha256:3f1c9a02)` —
  بنابراین گزارش را می‌توان در issue عمومی هم گذاشت.
- **فقط‌خواندنی.** `scan` چیزی نمی‌نویسد. `fix` فقط فایل‌های ناموجود را می‌سازد.
  تنها subprocess مجاز، `git` با دستورهای فقط‌خواندنی است.

مدل تهدید کامل: [`docs/security.md`](docs/security.md).

## پیکربندی

`.repodoctorrc.json` اختیاری (یا کلید `repoDoctor` در `package.json`):

```json
{
  "failOn": "high",
  "ignore": ["dist/**", "coverage/**"],
  "rules": {
    "ci/code-scanning-missing": "off",
    "docs/changelog-missing": "info"
  },
  "weights": { "security": 2 },
  "license": "MIT"
}
```

## API برنامه‌نویسی

```ts
import { scan, renderSarif } from "repo-doctor";

const { result, failed } = await scan({ path: ".", failOn: "high" });
console.log(result.summary.score, result.findings.length);
if (failed) process.exitCode = 1;
```

## معماری

صفر وابستگی اجرایی، TypeScript، ESM، `node:test`.

```
src/
├── cli/          پارس آرگومان، دستورها، خروجی
├── core/         context، engine، score، config
├── rules/        ۵۸ قاعده در ۷ گروه
├── deps/         پارسر manifestها
├── fix/          recipe + planner
├── init/         قالب فایل‌ها
├── report/       console، markdown، json، sarif
└── util/         glob، semver، fs، git، text
```

مسئولیت ماژول‌ها، ورودی/خروجی و وابستگی‌ها:
[`docs/modules.md`](docs/modules.md) و [`docs/architecture.md`](docs/architecture.md).

## مشارکت

مشارکت با آغوش باز پذیرفته می‌شود — مخصوصاً قاعده‌ی جدید، پارسر اکوسیستم جدید و
مستندسازی. از [`good first issue`](https://github.com/pooria683/repo-doctor/labels/good%20first%20issue)
شروع کن، [CONTRIBUTING.md](CONTRIBUTING.md) را بخوان و
[Code of Conduct](CODE_OF_CONDUCT.md) را رعایت کن.

```bash
npm install
npm test          # ۷۸ تست، حدود ۴ ثانیه
npm run self-scan # Repo Doctor روی خود Repo Doctor
```

## امنیت

آسیب‌پذیری را خصوصی گزارش کن — [SECURITY.md](SECURITY.md). برای مشکل امنیتی
issue عمومی باز نکن.

## لایسنس

[MIT](LICENSE) © ۲۰۲۵ مشارکت‌کنندگان Repo Doctor
