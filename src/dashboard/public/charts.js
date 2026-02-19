/**
 * SlimClaw Dashboard JavaScript - Chart.js integration and real-time updates
 * Handles data fetching, chart rendering, and UI interactions
 */

class SlimClawDashboard {
  constructor() {
    this.charts = {};
    this.refreshInterval = null;
    this.refreshRate = 30000; // 30 seconds
    this.isLoading = false;
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  /**
   * Initialize dashboard
   */
  async init() {
    console.log('🌟 Initializing SlimClaw Dashboard');
    
    this.setupEventListeners();
    await this.loadData();
    this.createCharts();
    this.startAutoRefresh();
    this.hideLoadingOverlay();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Time period selector
    const timePeriodSelect = document.getElementById('time-period');
    if (timePeriodSelect) {
      timePeriodSelect.addEventListener('change', () => {
        this.updateHistoryChart();
      });
    }

    // Manual refresh on click (for testing)
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('refresh-btn')) {
        this.loadData();
      }
    });
  }

  /**
   * Load data from API endpoints
   */
  async loadData() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.setStatus('loading', 'Loading...');

    try {
      const [optimizerResponse, historyResponse] = await Promise.all([
        fetch('/metrics/optimizer'),
        fetch('/metrics/history?period=hour&limit=24')
      ]);

      if (!optimizerResponse.ok || !historyResponse.ok) {
        throw new Error('Failed to fetch metrics data');
      }

      this.optimizerData = await optimizerResponse.json();
      this.historyData = await historyResponse.json();

      this.updateMetricCards();
      this.updateCharts();
      
      this.setStatus('connected', 'Connected');
      this.updateLastRefreshTime();
      
    } catch (error) {
      console.error('Failed to load data:', error);
      this.setStatus('error', 'Connection Error');
      this.showError('Failed to load metrics data. Please check the server connection.');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Update metric cards with current data
   */
  updateMetricCards() {
    const data = this.optimizerData;
    if (!data) return;

    // Total Requests
    this.updateElement('total-requests', data.totalRequests.toLocaleString());

    // Tokens Saved
    this.updateElement('tokens-saved', data.tokensSaved.total.toLocaleString());
    this.updateElement('tokens-saved-percent', `${data.tokensSaved.percentage}% avg`);

    // Cache Hit Rate
    this.updateElement('cache-hit-rate', `${data.cacheHitRate}%`);

    // Cost Saved
    this.updateElement('cost-saved', `$${data.totalCostSaved.toFixed(2)}`);

    // System Status
    this.updateElement('system-enabled', 
      data.systemStatus.enabled 
        ? '<span class="status-badge enabled">Enabled</span>' 
        : '<span class="status-badge disabled">Disabled</span>'
    );
    this.updateElement('buffer-size', data.systemStatus.bufferSize);
    this.updateElement('pending-flush', data.systemStatus.pendingFlush);
    this.updateElement('average-latency', `${data.averageLatencyMs} ms`);
    this.updateElement('windowing-usage', `${data.breakdown.windowing}%`);
    this.updateElement('routing-usage', `${data.breakdown.routing}%`);
  }

  /**
   * Create initial charts
   */
  createCharts() {
    this.createSavingsChart();
    this.createBreakdownChart();
    this.createComplexityChart();
  }

  /**
   * Create token savings over time chart
   */
  createSavingsChart() {
    const ctx = document.getElementById('savings-chart');
    if (!ctx) return;

    this.charts.savings = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Tokens Saved',
          data: [],
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }, {
          label: 'Requests',
          data: [],
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: false,
          yAxisID: 'y1'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top'
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Time'
            }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Tokens Saved'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Requests'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  }

  /**
   * Create optimization feature breakdown chart
   */
  createBreakdownChart() {
    const ctx = document.getElementById('breakdown-chart');
    if (!ctx) return;

    this.charts.breakdown = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Windowing', 'Caching', 'Routing', 'Other'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: [
            '#10B981', // Green for windowing
            '#8B5CF6', // Purple for caching
            '#F59E0B', // Yellow for routing
            '#6B7280'  // Gray for other
          ],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                return `${label}: ${value}%`;
              }
            }
          }
        }
      }
    });
  }

  /**
   * Create complexity distribution chart
   */
  createComplexityChart() {
    const ctx = document.getElementById('complexity-chart');
    if (!ctx) return;

    this.charts.complexity = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Simple', 'Mid', 'Complex', 'Reasoning'],
        datasets: [{
          label: 'Request Count',
          data: [0, 0, 0, 0],
          backgroundColor: [
            '#22C55E', // Green for simple
            '#3B82F6', // Blue for mid
            '#F59E0B', // Orange for complex
            '#EF4444'  // Red for reasoning
          ],
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.8)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });
  }

  /**
   * Update all charts with current data
   */
  updateCharts() {
    if (this.historyData) {
      this.updateSavingsChart();
    }
    
    if (this.optimizerData) {
      this.updateBreakdownChart();
      this.updateComplexityChart();
    }
  }

  /**
   * Update savings chart with history data
   */
  updateSavingsChart() {
    const chart = this.charts.savings;
    if (!chart || !this.historyData) return;

    const data = this.historyData.data || [];
    
    chart.data.labels = data.map(item => item.label);
    chart.data.datasets[0].data = data.map(item => item.metrics.tokensSaved);
    chart.data.datasets[1].data = data.map(item => item.metrics.requests);
    
    chart.update();
  }

  /**
   * Update breakdown chart
   */
  updateBreakdownChart() {
    const chart = this.charts.breakdown;
    if (!chart || !this.optimizerData) return;

    const breakdown = this.optimizerData.breakdown;
    chart.data.datasets[0].data = [
      breakdown.windowing,
      breakdown.cache,
      breakdown.routing,
      Math.max(0, 100 - breakdown.windowing - breakdown.cache - breakdown.routing)
    ];
    
    chart.update();
  }

  /**
   * Update complexity chart
   */
  updateComplexityChart() {
    const chart = this.charts.complexity;
    if (!chart || !this.optimizerData) return;

    const complexity = this.optimizerData.complexityDistribution;
    chart.data.datasets[0].data = [
      complexity.simple || 0,
      complexity.mid || 0,
      complexity.complex || 0,
      complexity.reasoning || 0
    ];
    
    chart.update();
  }

  /**
   * Update history chart with new time period
   */
  async updateHistoryChart() {
    const period = document.getElementById('time-period').value;
    
    try {
      const response = await fetch(`/metrics/history?period=${period}&limit=24`);
      if (!response.ok) throw new Error('Failed to fetch history data');
      
      this.historyData = await response.json();
      this.updateSavingsChart();
      
    } catch (error) {
      console.error('Failed to update history chart:', error);
    }
  }

  /**
   * Start auto-refresh timer
   */
  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.loadData();
    }, this.refreshRate);
    
    console.log(`🔄 Auto-refresh started (every ${this.refreshRate / 1000}s)`);
  }

  /**
   * Stop auto-refresh timer
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Set connection status
   */
  setStatus(status, text) {
    const indicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    
    if (indicator) {
      indicator.className = 'w-3 h-3 rounded-full mr-2';
      switch (status) {
        case 'connected':
          indicator.classList.add('bg-green-400');
          break;
        case 'loading':
          indicator.classList.add('bg-yellow-400', 'pulse-slow');
          break;
        case 'error':
          indicator.classList.add('bg-red-400');
          break;
      }
    }
    
    if (statusText) {
      statusText.textContent = text;
    }
  }

  /**
   * Update last refresh time
   */
  updateLastRefreshTime() {
    const element = document.getElementById('last-updated');
    if (element) {
      element.textContent = new Date().toLocaleTimeString();
    }
  }

  /**
   * Hide loading overlay
   */
  hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }

  /**
   * Show error message
   */
  showError(message) {
    // Could implement a toast notification system here
    console.error('Dashboard Error:', message);
  }

  /**
   * Update DOM element content
   */
  updateElement(id, content) {
    const element = document.getElementById(id);
    if (element) {
      if (typeof content === 'string' && content.includes('<')) {
        element.innerHTML = content;
      } else {
        element.textContent = content;
      }
    }
  }

  /**
   * Cleanup on page unload
   */
  destroy() {
    this.stopAutoRefresh();
    
    // Destroy charts
    Object.values(this.charts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    
    console.log('🧹 Dashboard cleanup complete');
  }
}

// Initialize dashboard
const dashboard = new SlimClawDashboard();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  dashboard.destroy();
});