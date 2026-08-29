# Intra — Business Onboarding Guide

## Purpose

This guide lets an operator onboard a local supplier without asking them to create an API, an MCP server, or a wallet beyond a **public receiving address**. Begin with one service only: flyer printing.

## Safety boundary

Never request a seed phrase, private key, password, BVN, NIN, bank-login details, or card details. A Celo address is public; independently verify that the business controls it with a small test transaction or approved signing flow before activation.

## What to explain to the supplier

Intra lets AI agents ask a structured question about the business’s service. A query fee, if enabled, pays for the information service—not for the actual customer order. The business sees a complete request, sends a quote, and the human customer approves any final order directly.

## Onboarding questionnaire

### A. Business and consent

1. What business name may appear to agents/customers?
2. Who is the authorised contact?
3. What WhatsApp number, email, or phone channel receives orders?
4. What city/country and areas do you serve? Do not collect a home address.
5. Do you consent to Intra requesting a quote and displaying that quote to a buyer?
6. What public Celo address should receive quote-query fees?

### B. First service route

1. What single service should Intra quote first?
2. What buyer details are necessary for an accurate quote?
3. Which details are mandatory versus optional?
4. Is the response a fixed price, estimate/range, availability, turnaround, delivery cost, or a combination?
5. What response time can you honestly commit to?
6. What small query fee is fair? Start at $0.01–$0.05.
7. What information must never appear in a public response?

### C. Quality control

1. When were these prices last updated and how often are they reviewed?
2. When should Intra say the request is out of service area/capacity?
3. How does the buyer give the final order approval?
4. Who can ask Intra to pause the route?

## Flyer-printing route template

```json
{
  "name": "Campus flyer printing quote",
  "slug": "flyer-printing",
  "description": "Current quote for A5/A4 flyers delivered near campus.",
  "queryFeeUsd": 0.02,
  "responseSlaMinutes": 30,
  "inputFields": [
    { "key": "size", "label": "Paper size", "example": "A5", "required": true },
    { "key": "quantity", "label": "Number of copies", "example": "100", "required": true },
    { "key": "colour", "label": "Colour preference", "example": "full-colour", "required": true },
    { "key": "deadline", "label": "Needed by", "example": "Friday 3pm", "required": true },
    { "key": "deliveryArea", "label": "Delivery/pick-up area", "example": "UNILAG main gate", "required": true }
  ]
}
```

## Activation checklist

- [ ] Supplier consent recorded.
- [ ] Contact channel tested.
- [ ] Public Celo address format valid and ownership verified.
- [ ] Price/availability information is genuine and dated.
- [ ] Required quote questions defined.
- [ ] SLA and quote expiry agreed.
- [ ] Operator has reviewed the route.
- [ ] Route is activated only after the checklist passes.
