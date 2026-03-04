# KIS 통합 트레이딩 플랫폼

한국투자증권(KIS) OpenAPI 기반 통합 주식 트레이딩 시스템

## 기능

### 📊 스캐너
- KOSPI/KOSDAQ 실시간 거래량 상위 종목 스캔
- RSI, 이동평균, 거래대금 필터링
- 자동 스캔 (10분 간격)
- 텔레그램 알림

### 📡 시그널
- **모멘텀**: MA 정배열 + RSI + 거래량 급증
- **돌파**: 20일 신고가 + 거래량 확인
- **반전**: RSI 과매도 + MA60 지지
- **터틀**: N일 브레이크아웃 + ATR 기반

### 🤖 자동매매
- 15:15 스캔 → 15:20 매수 → 09:05 전량매도 (KST)
- 6단계 필터: 가격, 등락률, 거래대금, 거래량증가, 고가근접, MA정배열
- 종목당 100만원 투자

### 🐢 터틀 스크리닝
- N일 돌파 감지
- ATR 기반 손절/목표가
- 포지션 사이징 계산
- 트레이딩 플레이북

### 📨 텔레그램
- 단일 봇으로 모든 알림 통합
- 카테고리별 태그: [스캐너], [트레이딩], [터틀], [시그널]

## 환경변수

```
DATABASE_URL=postgresql://...
KIS_APP_KEY=PSxxxxxxxx
KIS_APP_SECRET=xxxxx
KIS_ACCOUNT_NO=50123456-01
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHAT_ID=-100123456789
```

## 실행

```bash
npm install
npm run dev
```

## 기술 스택

- **Frontend**: React, Tailwind CSS, Vite
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL (Neon), Drizzle ORM
- **API**: KIS OpenAPI, Telegram Bot API
- **Deploy**: Replit
