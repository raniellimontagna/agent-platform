import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateLandingQuality, runLandingQualityGate } from './landingQuality.js';

const richLanding = `
<main>
  <section id="hero"><img src="/generated/higgsfield-hero.png" alt="Hero" /><a href="#contato">CTA</a></section>
  <section id="prova">Histórico local, contexto, dados e detalhes específicos para confiança.</section>
  <section id="servicos">Serviços consultivos, viagens personalizadas e atendimento sob medida.</section>
  <section id="processo">Processo em quatro etapas com briefing, curadoria, confirmação e suporte.</section>
  <section id="diferenciais">Diferenciais com prova, clareza e comparação com alternativas.</section>
  <section id="faq">FAQ com perguntas, dúvidas e objeções reais respondidas.</section>
  <section id="contato"><a href="#hero" class="cta">Falar com especialista</a></section>
</main>
<style>
@media (prefers-reduced-motion: reduce) { * { animation: none; transition: none; } }
.hero { transition: opacity 180ms ease; }
</style>
${'Copy específica de landing completa com detalhes de público, oferta, contexto, prova, destinos, objeções, processos e próximos passos. '.repeat(45)}
`;

describe('evaluateLandingQuality', () => {
  it('aprova landing completa com seções, CTA, FAQ, mídia, motion e copy suficiente', () => {
    expect(evaluateLandingQuality(richLanding)).toEqual([]);
  });

  it('exige Motion real quando o projeto tem a dependência motion', () => {
    expect(evaluateLandingQuality(richLanding, { requiresMotionDev: true })).toEqual(
      expect.arrayContaining([expect.stringContaining('use real Motion APIs')]),
    );

    expect(
      evaluateLandingQuality(`${richLanding}\nimport { animate, inView } from "motion";\n`, {
        requiresMotionDev: true,
      }),
    ).toEqual([]);
  });

  it('reprova landing rasa e genérica', () => {
    const failures = evaluateLandingQuality(`
      <section id="hero"><a href="#contato">Começar</a></section>
      <section id="contato">Transforme sua empresa com solutions for your business.</section>
    `);

    expect(failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('at least 6 meaningful sections'),
        expect.stringContaining('at least 2 conversion CTAs'),
        expect.stringContaining('FAQ'),
        expect.stringContaining('media/visual asset'),
        expect.stringContaining('motion'),
        expect.stringContaining('too thin'),
        expect.stringContaining('generic or placeholder copy'),
      ]),
    );
  });
});

describe('runLandingQualityGate', () => {
  it('só roda para landing-page-agent e arquivos de landing textuais', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'landing-quality-'));
    await writeFile(join(dir, 'README.md'), 'Transforme sua empresa', 'utf8');

    await expect(
      runLandingQualityGate({
        dir,
        filesChanged: ['README.md'],
        agentKey: 'coder-agent',
      }),
    ).resolves.toMatchObject({ passed: true, results: [] });
  });

  it('falha para landing-page-agent quando a página gerada é rasa', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'landing-quality-'));
    await writeFile(
      join(dir, 'src-page.astro'),
      '<section id="hero">placeholder</section>',
      'utf8',
    );

    const result = await runLandingQualityGate({
      dir,
      filesChanged: ['src-page.astro'],
      agentKey: 'landing-page-agent',
    });

    expect(result.passed).toBe(false);
    expect(result.failureTail).toContain('landing-quality-gate');
  });

  it('detecta dependência motion no package.json e exige uso real da biblioteca', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'landing-quality-'));
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ dependencies: { motion: '12.40.0' } }),
      'utf8',
    );
    await writeFile(join(dir, 'src-page.astro'), richLanding, 'utf8');

    const result = await runLandingQualityGate({
      dir,
      filesChanged: ['src-page.astro'],
      agentKey: 'landing-page-agent',
    });

    expect(result.passed).toBe(false);
    expect(result.failureTail).toContain('use real Motion APIs');
  });
});
