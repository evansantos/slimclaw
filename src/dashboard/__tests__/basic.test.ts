/**
 * SlimClaw Dashboard Basic Tests
 * Simplified tests focusing on core functionality
 */

import { describe, it, expect } from 'vitest';
import { DashboardUtils } from '../index.js';

describe('Dashboard Utils', () => {
  describe('formatTokens', () => {
    it('should format large token counts', () => {
      expect(DashboardUtils.formatTokens(1234567)).toBe('1.2M');
      expect(DashboardUtils.formatTokens(123456)).toBe('123.5K');
      expect(DashboardUtils.formatTokens(1234)).toBe('1.2K');
      expect(DashboardUtils.formatTokens(123)).toBe('123');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentages correctly', () => {
      expect(DashboardUtils.formatPercentage(23.456)).toBe('23.5%');
      expect(DashboardUtils.formatPercentage(23.456, 2)).toBe('23.46%');
      expect(DashboardUtils.formatPercentage(0)).toBe('0.0%');
      expect(DashboardUtils.formatPercentage(100)).toBe('100.0%');
    });
  });

  describe('formatCurrency', () => {
    it('should format currency amounts', () => {
      expect(DashboardUtils.formatCurrency(1.2345)).toBe('$1.23');
      expect(DashboardUtils.formatCurrency(0.001234)).toBe('$0.0012');
      expect(DashboardUtils.formatCurrency(1000.567)).toBe('$1,000.57');
    });
  });

  describe('calculateSavingsPercentage', () => {
    it('should calculate savings percentage correctly', () => {
      expect(DashboardUtils.calculateSavingsPercentage(1000, 800)).toBe(20);
      expect(DashboardUtils.calculateSavingsPercentage(500, 400)).toBe(20);
      expect(DashboardUtils.calculateSavingsPercentage(0, 0)).toBe(0);
      expect(DashboardUtils.calculateSavingsPercentage(100, 100)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(DashboardUtils.calculateSavingsPercentage(0, 100)).toBe(0);
      expect(DashboardUtils.calculateSavingsPercentage(100, 0)).toBe(100);
    });
  });

  describe('getChartColors', () => {
    it('should return consistent color palette', () => {
      const colors1 = DashboardUtils.getChartColors();
      const colors2 = DashboardUtils.getChartColors();
      
      expect(colors1).toEqual(colors2);
      expect(colors1.primary).toBe('#3B82F6');
      expect(colors1.success).toBe('#10B981');
      expect(colors1.warning).toBe('#F59E0B');
      expect(colors1.danger).toBe('#EF4444');
      expect(colors1.info).toBe('#8B5CF6');
      expect(colors1.secondary).toBe('#6B7280');
    });
  });

  describe('generateTimeLabels', () => {
    it('should generate hour labels', () => {
      const labels = DashboardUtils.generateTimeLabels('hour', 3);
      expect(labels).toHaveLength(3);
      expect(labels[0]).toMatch(/^\d{1,2}:\d{2}$/); // HH:MM format
    });

    it('should generate day labels', () => {
      const labels = DashboardUtils.generateTimeLabels('day', 3);
      expect(labels).toHaveLength(3);
      expect(labels[0]).toMatch(/^[A-Za-z]{3} \d{1,2}$/); // Month day format
    });

    it('should generate week labels', () => {
      const labels = DashboardUtils.generateTimeLabels('week', 2);
      expect(labels).toHaveLength(2);
      expect(labels[0]).toMatch(/^Week of [A-Za-z]{3} \d{1,2}$/);
    });
  });

  describe('validateConfig', () => {
    it('should validate valid configurations', () => {
      const errors = DashboardUtils.validateConfig({
        port: 3001,
        host: 'localhost',
        basePath: '/api'
      });
      
      expect(errors).toEqual([]);
    });

    it('should catch invalid port numbers', () => {
      let errors = DashboardUtils.validateConfig({ port: -1 });
      expect(errors).toContain('Port must be an integer between 1 and 65535');
      
      errors = DashboardUtils.validateConfig({ port: 70000 });
      expect(errors).toContain('Port must be an integer between 1 and 65535');
      
      errors = DashboardUtils.validateConfig({ port: 1.5 });
      expect(errors).toContain('Port must be an integer between 1 and 65535');
    });

    it('should catch invalid host values', () => {
      let errors = DashboardUtils.validateConfig({ host: '' });
      expect(errors).toContain('Host must be a non-empty string');
      
      errors = DashboardUtils.validateConfig({ host: 123 as any });
      expect(errors).toContain('Host must be a non-empty string');
    });

    it('should catch invalid basePath values', () => {
      const errors = DashboardUtils.validateConfig({ basePath: 123 as any });
      expect(errors).toContain('basePath must be a string');
    });

    it('should collect multiple errors', () => {
      const errors = DashboardUtils.validateConfig({
        port: -1,
        host: '',
        basePath: 123 as any
      });
      
      expect(errors).toHaveLength(3);
    });
  });
});

describe('Dashboard Constants', () => {
  it('should export default configuration', async () => {
    const { DEFAULT_DASHBOARD_CONFIG } = await import('../index.js');
    
    expect(DEFAULT_DASHBOARD_CONFIG).toEqual({
      port: 3001,
      host: '0.0.0.0',
      basePath: ''
    });
  });
});

describe('Dashboard Errors', () => {
  it('should create dashboard errors correctly', async () => {
    const { DashboardError, DashboardConnectionError, DashboardDataError } = await import('../index.js');
    
    const error = new DashboardError('Test error', 'TEST_CODE', 400);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('DashboardError');
    
    const connectionError = new DashboardConnectionError('Connection failed', 3001);
    expect(connectionError.message).toBe('Connection failed');
    expect(connectionError.port).toBe(3001);
    expect(connectionError.code).toBe('CONNECTION_ERROR');
    expect(connectionError.statusCode).toBe(500);
    
    const dataError = new DashboardDataError('Invalid data');
    expect(dataError.message).toBe('Invalid data');
    expect(dataError.code).toBe('DATA_ERROR');
    expect(dataError.statusCode).toBe(400);
  });
});