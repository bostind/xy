// 全局变量
let chart = null;
let pressureSettings = {
    highPressureMax: 140,
    highPressureMin: 90,
    lowPressureMax: 90,
    lowPressureMin: 60
};

// 初始化
async function init() {
    // 添加文件上传事件监听
    const fileInput = document.getElementById('csvFile');
    const fileInfo = document.getElementById('fileInfo');
    
    fileInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (file) {
            if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
                fileInfo.textContent = '请选择CSV文件';
                return;
            }
            
            fileInfo.textContent = `已选择: ${file.name}`;
            const data = await loadDataFromFile(file);
            if (data.length > 0) {
                updateStats(data);
                updateTable(data);
                createChart(data);
            } else {
                fileInfo.textContent = '文件格式错误或为空';
            }
        }
    });
    
    // 添加设置按钮事件监听
    document.getElementById('applySettings').addEventListener('click', applySettings);
}

// 从文件加载数据
async function loadDataFromFile(file) {
    try {
        const text = await file.text();
        return parseCSV(text);
    } catch (error) {
        console.error('加载数据失败:', error);
        return [];
    }
}

// 解析CSV数据
function parseCSV(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        const entry = {
            date: new Date(values[0]),
            highPressure: parseInt(values[1]),
            lowPressure: parseInt(values[2]),
            pulse: parseInt(values[3])
        };
        data.push(entry);
    }
    
    return data;
}

// 计算统计数据
function calculateStats(data, field) {
    const values = data.map(item => item[field]);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    
    return {
        average: avg.toFixed(1),
        max: max,
        min: min
    };
}

// 计算异常值统计
function calculateAbnormalStats(data) {
    const total = data.length;
    const highAbnormal = data.filter(item => item.highPressure > pressureSettings.highPressureMax).length;
    const lowAbnormal = data.filter(item => item.lowPressure > pressureSettings.lowPressureMax).length;
    
    return {
        total,
        highAbnormal,
        lowAbnormal,
        highAbnormalPercentage: ((highAbnormal / total) * 100).toFixed(1),
        lowAbnormalPercentage: ((lowAbnormal / total) * 100).toFixed(1)
    };
}

// 更新统计信息显示
function updateStats(data) {
    const highPressureStats = calculateStats(data, 'highPressure');
    const lowPressureStats = calculateStats(data, 'lowPressure');
    const pulseStats = calculateStats(data, 'pulse');
    const abnormalStats = calculateAbnormalStats(data);
    
    // 更新测量统计
    document.getElementById('measurementStats').innerHTML = `
        <p>
            <span class="label">总测量次数</span>
            <span class="value">${abnormalStats.total} 次</span>
        </p>
        <p>
            <span class="label">高压异常次数</span>
            <span class="value">${abnormalStats.highAbnormal} 次</span>
            <span class="percentage">(${abnormalStats.highAbnormalPercentage}%)</span>
        </p>
        <p>
            <span class="label">低压异常次数</span>
            <span class="value">${abnormalStats.lowAbnormal} 次</span>
            <span class="percentage">(${abnormalStats.lowAbnormalPercentage}%)</span>
        </p>
    `;
    
    // 更新高压统计
    document.getElementById('highPressureStats').innerHTML = `
        <p>
            <span class="label">平均值</span>
            <span class="value">${highPressureStats.average} mmHg</span>
        </p>
        <p>
            <span class="label">最高值</span>
            <span class="value">${highPressureStats.max} mmHg</span>
        </p>
        <p>
            <span class="label">最低值</span>
            <span class="value">${highPressureStats.min} mmHg</span>
        </p>
    `;
    
    // 更新低压统计
    document.getElementById('lowPressureStats').innerHTML = `
        <p>
            <span class="label">平均值</span>
            <span class="value">${lowPressureStats.average} mmHg</span>
        </p>
        <p>
            <span class="label">最高值</span>
            <span class="value">${lowPressureStats.max} mmHg</span>
        </p>
        <p>
            <span class="label">最低值</span>
            <span class="value">${lowPressureStats.min} mmHg</span>
        </p>
    `;
    
    // 更新脉搏统计
    document.getElementById('pulseStats').innerHTML = `
        <p>
            <span class="label">平均值</span>
            <span class="value">${pulseStats.average} 次/分</span>
        </p>
        <p>
            <span class="label">最高值</span>
            <span class="value">${pulseStats.max} 次/分</span>
        </p>
        <p>
            <span class="label">最低值</span>
            <span class="value">${pulseStats.min} 次/分</span>
        </p>
    `;
}

// 更新数据表格
function updateTable(data) {
    const tbody = document.getElementById('dataTable');
    tbody.innerHTML = '';
    
    data.forEach(entry => {
        const row = document.createElement('tr');
        const highPressureClass = entry.highPressure > pressureSettings.highPressureMax ? 'abnormal-high' : '';
        const lowPressureClass = entry.lowPressure > pressureSettings.lowPressureMax ? 'abnormal-low' : '';
        
        row.innerHTML = `
            <td>${entry.date.toLocaleString()}</td>
            <td class="${highPressureClass}">${entry.highPressure}</td>
            <td class="${lowPressureClass}">${entry.lowPressure}</td>
            <td>${entry.pulse}</td>
        `;
        tbody.appendChild(row);
    });
}

// 创建图表
function createChart(data) {
    const ctx = document.getElementById('bloodPressureChart').getContext('2d');
    const dates = data.map(entry => entry.date.toLocaleString());
    
    // 计算Y轴范围
    const minPressure = Math.min(...data.map(entry => entry.lowPressure));
    const maxPressure = Math.max(...data.map(entry => entry.highPressure));
    const minPulse = Math.min(...data.map(entry => entry.pulse));
    const maxPulse = Math.max(...data.map(entry => entry.pulse));
    
    // 创建数据集
    const datasets = [
        {
            label: '高压',
            data: data.map(entry => entry.highPressure),
            borderColor: data.map(entry => 
                entry.highPressure > pressureSettings.highPressureMax ? 'rgb(255, 0, 0)' : 'rgba(255, 99, 132, 0.5)'
            ),
            backgroundColor: data.map(entry => 
                entry.highPressure > pressureSettings.highPressureMax ? 'rgb(255, 0, 0)' : 'rgba(255, 99, 132, 0.5)'
            ),
            tension: 0.1,
            pointBackgroundColor: data.map(entry => 
                entry.highPressure > pressureSettings.highPressureMax ? 'rgb(255, 0, 0)' : 'rgba(255, 99, 132, 0.5)'
            ),
            pointRadius: data.map(entry => 
                entry.highPressure > pressureSettings.highPressureMax ? 3.8 : 3
            ),
            pointHoverRadius: data.map(entry => 
                entry.highPressure > pressureSettings.highPressureMax ? 5.0 : 3.9
            )
        },
        {
            label: '低压',
            data: data.map(entry => entry.lowPressure),
            borderColor: data.map(entry => 
                entry.lowPressure > pressureSettings.lowPressureMax ? 'rgb(252, 117, 7)' : 'rgba(54, 162, 235, 0.5)'
            ),
            backgroundColor: data.map(entry => 
                entry.lowPressure > pressureSettings.lowPressureMax ? 'rgb(252, 117, 7)' : 'rgba(54, 162, 235, 0.5)'
            ),
            tension: 0.1,
            pointBackgroundColor: data.map(entry => 
                entry.lowPressure > pressureSettings.lowPressureMax ? 'rgb(252, 117, 7)' : 'rgba(54, 162, 235, 0.5)'
            ),
            pointRadius: data.map(entry => 
                entry.lowPressure > pressureSettings.lowPressureMax ? 3.8 : 3
            ),
            pointHoverRadius: data.map(entry => 
                entry.lowPressure > pressureSettings.lowPressureMax ? 5.0 : 3.9
            )
        },
        {
            label: '脉搏',
            data: data.map(entry => entry.pulse),
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            tension: 0.1,
            hidden: true,
            yAxisID: 'pulse'
        }
    ];
    
    // 如果已存在图表，销毁它
    if (chart) {
        chart.destroy();
    }
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    min: Math.floor(minPressure * 0.9),
                    max: Math.ceil(maxPressure * 1.1),
                    position: 'left',
                    title: {
                        display: true,
                        text: '血压 (mmHg)'
                    }
                },
                pulse: {
                    beginAtZero: false,
                    min: Math.floor(minPulse * 0.9),
                    max: Math.ceil(maxPulse * 1.1),
                    position: 'right',
                    title: {
                        display: true,
                        text: '脉搏 (次/分)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '血压和脉搏变化趋势'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += context.parsed.y;
                            if (context.dataset.label === '高压' && context.parsed.y > pressureSettings.highPressureMax) {
                                label += ' (偏高)';
                            } else if (context.dataset.label === '低压' && context.parsed.y > pressureSettings.lowPressureMax) {
                                label += ' (偏高)';
                            }
                            return label;
                        }
                    }
                },
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 20
                    }
                },
                annotation: {
                    annotations: {
                        highPressureLine: {
                            type: 'line',
                            yMin: pressureSettings.highPressureMax,
                            yMax: pressureSettings.highPressureMax,
                            borderColor: 'rgba(255, 99, 132, 0.5)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: '高压上限',
                                enabled: true,
                                position: 'start',
                                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                                color: '#fff',
                                padding: 4
                            }
                        },
                        lowPressureLine: {
                            type: 'line',
                            yMin: pressureSettings.lowPressureMax,
                            yMax: pressureSettings.lowPressureMax,
                            borderColor: 'rgba(54, 162, 235, 0.5)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: '低压上限',
                                enabled: true,
                                position: 'start',
                                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                                color: '#fff',
                                padding: 4
                            }
                        }
                    }
                }
            }
        }
    });
}

// 应用设置
function applySettings() {
    pressureSettings.highPressureMax = parseInt(document.getElementById('highPressureMax').value);
    pressureSettings.highPressureMin = parseInt(document.getElementById('highPressureMin').value);
    pressureSettings.lowPressureMax = parseInt(document.getElementById('lowPressureMax').value);
    pressureSettings.lowPressureMin = parseInt(document.getElementById('lowPressureMin').value);
    
    // 重新加载数据并更新显示
    const fileInput = document.getElementById('csvFile');
    if (fileInput.files.length > 0) {
        loadDataFromFile(fileInput.files[0]).then(data => {
            if (data.length > 0) {
                updateStats(data);
                updateTable(data);
                createChart(data);
            }
        });
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init); 