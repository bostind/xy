// 全局变量
let bloodPressureChart = null;
let pulseChart = null;

// 颜色配置
const colorConfig = {
    // 高压相关颜色
    highPressure: {
        main: 'rgb(255, 159, 159)',      // 柔和的红色
        avg: 'rgb(255, 183, 77)',        // 柔和的橙色
        limit: 'rgb(255, 107, 107)',     // 柔和的警示红
        limitBg: 'rgba(255, 107, 107, 0.1)', // 柔和的警示红背景
        bg: 'rgba(255, 159, 159, 0.1)'   // 柔和的红色背景
    },
    // 低压相关颜色
    lowPressure: {
        main: 'rgb(77, 171, 247)',       // 柔和的蓝色
        avg: 'rgb(131, 194, 246)',        // 柔和的蓝色
        limit: 'rgb(255, 149, 0)',       // 柔和的橙色
        limitBg: 'rgba(255, 149, 0, 0.1)', // 柔和的橙色背景
        bg: 'rgba(77, 171, 247, 0.1)'    // 柔和的蓝色背景
    },
    // 脉搏相关颜色
    pulse: {
        main: 'rgb(129, 199, 132)',      // 柔和的绿色
        avg: 'rgb(179, 242, 182)',       // 柔和的绿色
        bg: 'rgba(129, 199, 132, 0.1)'   // 柔和的绿色背景
    },
    // 通用颜色
    common: {
        grid: 'rgba(0, 0, 0, 0.05)',     // 更淡的网格线
        text: 'rgb(97, 97, 97)',         // 柔和的深灰色
        error: 'rgb(244, 67, 54)'        // 柔和的错误红
    }
};

let pressureSettings = {
    highPressure: 140,
    lowPressure: 90
};

// 预处理数据：5分钟间隔取平均值
function preprocessData(data) {
    // 按5分钟间隔分组
    const groups = new Map();
    
    data.forEach(entry => {
        // 将时间向下取整到最近的5分钟
        const time = new Date(entry.date);
        const minutes = time.getMinutes();
        const roundedMinutes = Math.floor(minutes / 5) * 5;
        const roundedTime = new Date(time);
        roundedTime.setMinutes(roundedMinutes, 0, 0);
        const timeKey = roundedTime.getTime();
        
        if (!groups.has(timeKey)) {
            groups.set(timeKey, {
                date: roundedTime,
                highPressure: [],
                lowPressure: [],
                pulse: []
            });
        }
        
        const group = groups.get(timeKey);
        group.highPressure.push(entry.highPressure);
        group.lowPressure.push(entry.lowPressure);
        group.pulse.push(entry.pulse);
    });
    
    // 计算每组的平均值和标准差
    const processedData = Array.from(groups.values()).map(group => ({
        date: group.date,
        highPressure: Math.round(group.highPressure.reduce((a, b) => a + b, 0) / group.highPressure.length),
        lowPressure: Math.round(group.lowPressure.reduce((a, b) => a + b, 0) / group.lowPressure.length),
        pulse: Math.round(group.pulse.reduce((a, b) => a + b, 0) / group.pulse.length),
        highPressureStdDev: calculateStdDev(group.highPressure),
        lowPressureStdDev: calculateStdDev(group.lowPressure),
        pulseStdDev: calculateStdDev(group.pulse)
    }));
    
    return {
        originalCount: data.length,
        processedData: processedData.sort((a, b) => a.date - b.date)
    };
}

// 初始化
async function init() {
    // 添加文件上传事件监听
    const fileInput = document.getElementById('csvFile');
    const fileInfo = document.getElementById('fileInfo');
    
    // 添加导出PDF按钮事件监听
    const exportPdfButton = document.getElementById('exportPdf');
    exportPdfButton.addEventListener('click', exportToPdf);
    
    fileInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (file) {
            if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
                fileInfo.textContent = '请选择CSV文件';
                return;
            }
            
            fileInfo.textContent = `已选择: ${file.name}`;
            const rawData = await loadDataFromFile(file);
            if (rawData.length > 0) {
                // 显示所有元素
                document.querySelector('.settings-panel').style.display = 'block';
                document.querySelector('.stats-container').style.display = 'grid';
                document.querySelectorAll('.chart-container').forEach(el => el.style.display = 'block');
                document.querySelectorAll('.chart-stats-container').forEach(el => el.style.display = 'flex');
                document.querySelector('.table-container').style.display = 'block';
                document.querySelector('.recommendations-container').style.display = 'block';
                
                // 隐藏文件格式要求
                document.querySelector('.file-format-info').style.display = 'none';
                
                const { originalCount, processedData } = preprocessData(rawData);
                updateStats(processedData, originalCount);
                updateTable(processedData);
                createChart(processedData);
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
    const headers = lines[0].split(/[\t,]/).map(h => h.trim().replace(/^["']|["']$/g, '')); // 支持制表符和逗号分隔，并移除引号
    
    // 查找所需列的索引
    const findColumnIndex = (possibleNames) => {
        for (const name of possibleNames) {
            const index = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
            if (index !== -1) return index;
        }
        return -1;
    };

    // 查找各列的索引
    const dateIndex = findColumnIndex(['日期', 'date', '时间', 'time', '测量时间', '测量日期']);
    const highPressureIndex = findColumnIndex(['高压', 'high', '收缩压', 'systolic', '收缩']);
    const lowPressureIndex = findColumnIndex(['低压', 'low', '舒张压', 'diastolic', '舒张']);
    const pulseIndex = findColumnIndex(['脉搏', 'pulse', '心率', 'heart rate', '心跳']);

    // 验证必要的列是否存在
    if (dateIndex === -1 || highPressureIndex === -1 || lowPressureIndex === -1 || pulseIndex === -1) {
        throw new Error('CSV文件格式错误：缺少必要的列（日期、高压、低压、脉搏）');
    }

    const data = [];
    let errorLines = [];
    
    // 解析CSV行
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"' || char === "'") {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim().replace(/^["']|["']$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        
        // 添加最后一个字段
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        return result;
    }
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        try {
            const values = parseCSVLine(lines[i]);
            
            // 只提取必要的四列数据
            const date = parseDate(values[dateIndex]);
            const highPressure = parseInt(values[highPressureIndex]);
            const lowPressure = parseInt(values[lowPressureIndex]);
            const pulse = parseInt(values[pulseIndex]);

            // 验证数值
            if (isNaN(highPressure) || isNaN(lowPressure) || isNaN(pulse)) {
                throw new Error('数值格式错误');
            }

            // 验证数值范围
            if (highPressure < 60 || highPressure > 250) {
                throw new Error('高压数值超出正常范围');
            }
            if (lowPressure < 40 || lowPressure > 150) {
                throw new Error('低压数值超出正常范围');
            }
            if (pulse < 40 || pulse > 200) {
                throw new Error('脉搏数值超出正常范围');
            }

            data.push({
                date: date,
                highPressure: highPressure,
                lowPressure: lowPressure,
                pulse: pulse
            });
        } catch (error) {
            errorLines.push({
                line: i + 1,
                content: lines[i],
                error: error.message
            });
        }
    }

    // 如果有错误行，显示错误信息
    if (errorLines.length > 0) {
        const errorMessage = `发现 ${errorLines.length} 行数据格式错误：\n` +
            errorLines.map(e => `第 ${e.line} 行: ${e.error}\n数据: ${e.content}`).join('\n');
        console.warn(errorMessage);
        // 显示错误信息到UI
        const fileInfo = document.getElementById('fileInfo');
        if (fileInfo) {
            fileInfo.innerHTML = `<span style="color: red;">发现 ${errorLines.length} 行数据格式错误，请检查数据格式</span>`;
        }
    }

    return data;
}

// 解析日期字符串
function parseDate(dateStr) {
    // 移除多余的空格和引号
    dateStr = dateStr.trim().replace(/^["']|["']$/g, '');
    
    // 尝试多种日期格式
    const formats = [
        // YYYY-MM-DD HH:mm:ss
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/,
        // YYYY/MM/DD HH:mm:ss
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/,
        // YYYY-MM-DD HH:mm
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/,
        // YYYY/MM/DD HH:mm
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/,
        // YYYY-MM-DD HH:mm:ss.SSS
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/,
        // YYYY/MM/DD HH:mm:ss.SSS
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/,
        // YYYY-MM-DD HH:mm:ss,SSS
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2}),(\d{1,3})$/,
        // YYYY/MM/DD HH:mm:ss,SSS
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2}),(\d{1,3})$/
    ];

    for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
            const [_, year, month, day, hour, minute, second = '00'] = match;
            return new Date(year, month - 1, day, hour, minute, second);
        }
    }

    throw new Error(`无法解析日期格式: ${dateStr}`);
}

// 计算统计数据
function calculateStats(data, field) {
    const values = data.map(item => item[field]);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    
    const stats = {
        average: avg.toFixed(1),
        max: max,
        min: min
    };
    
    //console.log(`${field} 统计数据:`, stats);
    return stats;
}

// 计算异常值统计
function calculateAbnormalStats(data) {
    const total = data.length;
    const highAbnormal = data.filter(item => item.highPressure > pressureSettings.highPressure).length;
    const lowAbnormal = data.filter(item => item.lowPressure > pressureSettings.lowPressure).length;
    
    return {
        total,
        highAbnormal,
        lowAbnormal,
        highAbnormalPercentage: ((highAbnormal / total) * 100).toFixed(1),
        lowAbnormalPercentage: ((lowAbnormal / total) * 100).toFixed(1)
    };
}

// 计算标准差
function calculateStdDev(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => {
        const diff = value - mean;
        return diff * diff;
    });
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff).toFixed(1);
}

// 计算昼夜差异
function calculateDayNightDifference(data) {
    const dayData = data.filter(entry => {
        const hour = new Date(entry.date).getHours();
        return hour >= 6 && hour < 18;
    });
    
    const nightData = data.filter(entry => {
        const hour = new Date(entry.date).getHours();
        return hour < 6 || hour >= 18;
    });
    
    const dayHighAvg = dayData.reduce((sum, entry) => sum + entry.highPressure, 0) / dayData.length;
    const nightHighAvg = nightData.reduce((sum, entry) => sum + entry.highPressure, 0) / nightData.length;
    const dayLowAvg = dayData.reduce((sum, entry) => sum + entry.lowPressure, 0) / dayData.length;
    const nightLowAvg = nightData.reduce((sum, entry) => sum + entry.lowPressure, 0) / nightData.length;
    
    const highDiff = ((dayHighAvg - nightHighAvg) / nightHighAvg * 100).toFixed(1);
    const lowDiff = ((dayLowAvg - nightLowAvg) / nightLowAvg * 100).toFixed(1);
    
    return {
        dayHighAvg: dayHighAvg.toFixed(1),
        nightHighAvg: nightHighAvg.toFixed(1),
        dayLowAvg: dayLowAvg.toFixed(1),
        nightLowAvg: nightLowAvg.toFixed(1),
        highDiff,
        lowDiff,
        isDipper: highDiff >= 10 && lowDiff >= 10
    };
}

// 血压分类统计
function calculatePressureCategories(data) {
    const categories = {
        normal: { count: 0, label: '正常血压 (<120/80)' },
        elevated: { count: 0, label: '正常高值 (120-129/<80)' },
        stage1: { count: 0, label: '轻度高血压 (130-139/80-89)' },
        stage2: { count: 0, label: '中度高血压 (140-159/90-99)' },
        stage3: { count: 0, label: '重度高血压 (≥160/≥100)' }
    };
    
    data.forEach(entry => {
        if (entry.highPressure < 120 && entry.lowPressure < 80) {
            categories.normal.count++;
        } else if (entry.highPressure >= 120 && entry.highPressure <= 129 && entry.lowPressure < 80) {
            categories.elevated.count++;
        } else if ((entry.highPressure >= 130 && entry.highPressure <= 139) || (entry.lowPressure >= 80 && entry.lowPressure <= 89)) {
            categories.stage1.count++;
        } else if ((entry.highPressure >= 140 && entry.highPressure <= 159) || (entry.lowPressure >= 90 && entry.lowPressure <= 99)) {
            categories.stage2.count++;
        } else if (entry.highPressure >= 160 || entry.lowPressure >= 100) {
            categories.stage3.count++;
        }
    });
    
    return categories;
}

// 计算血压负荷
function calculatePressureLoad(data) {
    const total = data.length;
    const dayData = data.filter(entry => {
        const hour = new Date(entry.date).getHours();
        return hour >= 6 && hour < 18;
    });
    const nightData = data.filter(entry => {
        const hour = new Date(entry.date).getHours();
        return hour < 6 || hour >= 18;
    });
    
    const highLoad = data.filter(entry => entry.highPressure > pressureSettings.highPressure).length;
    const lowLoad = data.filter(entry => entry.lowPressure > pressureSettings.lowPressure).length;
    const dayHighLoad = dayData.filter(entry => entry.highPressure > pressureSettings.highPressure).length;
    const nightHighLoad = nightData.filter(entry => entry.highPressure > pressureSettings.highPressure).length;
    const dayLowLoad = dayData.filter(entry => entry.lowPressure > pressureSettings.lowPressure).length;
    const nightLowLoad = nightData.filter(entry => entry.lowPressure > pressureSettings.lowPressure).length;
    
    return {
        totalLoad: ((highLoad + lowLoad) / (total * 2) * 100).toFixed(1),
        highLoad: (highLoad / total * 100).toFixed(1),
        lowLoad: (lowLoad / total * 100).toFixed(1),
        dayHighLoad: (dayHighLoad / dayData.length * 100).toFixed(1),
        nightHighLoad: (nightHighLoad / nightData.length * 100).toFixed(1),
        dayLowLoad: (dayLowLoad / dayData.length * 100).toFixed(1),
        nightLowLoad: (nightLowLoad / nightData.length * 100).toFixed(1)
    };
}

// 更新统计信息显示
function updateStats(data, originalCount) {
    // 保存处理后的数据到全局变量
    window.processedData = data;
    
    const highPressureStats = calculateStats(data, 'highPressure');
    const lowPressureStats = calculateStats(data, 'lowPressure');
    const pulseStats = calculateStats(data, 'pulse');
    const abnormalStats = calculateAbnormalStats(data);
    
    // 计算新的统计信息
    const highPressureStdDev = calculateStdDev(data.map(entry => entry.highPressure));
    const lowPressureStdDev = calculateStdDev(data.map(entry => entry.lowPressure));
    const pulseStdDev = calculateStdDev(data.map(entry => entry.pulse));
    
    const dayNightDiff = calculateDayNightDifference(data);
    const pressureCategories = calculatePressureCategories(data);
    const pressureLoad = calculatePressureLoad(data);

    // 生成血压建议
    const recommendations = generateBloodPressureRecommendations(
        highPressureStats,
        lowPressureStats,
        pulseStats,
        abnormalStats,
        dayNightDiff,
        pressureCategories,
        pressureLoad,
        highPressureStdDev,
        lowPressureStdDev
    );
    
    // 更新测量统计
    document.getElementById('measurementStats').innerHTML = `
        <p>
            <span class="label">原始数据点数</span>
            <span class="value">${originalCount} 次</span>
        </p>
        <p>
            <span class="label">处理后数据点数<span class="info-icon" title="间隔5分钟的多条数据取平均值">?</span></span>
            <span class="value">${data.length} 次</span>
        </p>
        <p>
            <span class="label">高压异常次数<span class="info-icon" title="超过${pressureSettings.highPressure}mmHg的次数">?</span></span>
            <span class="value">${abnormalStats.highAbnormal} 次</span>
            <span class="percentage">(${abnormalStats.highAbnormalPercentage}%)</span>
        </p>
        <p>
            <span class="label">低压异常次数<span class="info-icon" title="超过${pressureSettings.lowPressure}mmHg的次数">?</span></span>
            <span class="value">${abnormalStats.lowAbnormal} 次</span>
            <span class="percentage">(${abnormalStats.lowAbnormalPercentage}%)</span>
        </p>
    `;

    // 更新血压分析建议
    document.getElementById('recommendationsContent').innerHTML = recommendations.map(rec => 
        `<p class="recommendation-item">${rec}</p>`
    ).join('');
    
    // 更新高压统计
    document.getElementById('highPressureStats').innerHTML = `
        <p>
            <span class="label">最高值</span>
            <span class="value">${highPressureStats.max} mmHg</span>
        </p>
        <p>
            <span class="label">最低值</span>
            <span class="value">${highPressureStats.min} mmHg</span>
        </p>
        <p>
            <span class="label">平均值</span>
            <span class="value">${highPressureStats.average} mmHg</span>
        </p>
    `;
    
    // 更新低压统计
    document.getElementById('lowPressureStats').innerHTML = `
        <p>
            <span class="label">最高值</span>
            <span class="value">${lowPressureStats.max} mmHg</span>
        </p>
        <p>
            <span class="label">最低值</span>
            <span class="value">${lowPressureStats.min} mmHg</span>
        </p>
        <p>
            <span class="label">平均值</span>
            <span class="value">${lowPressureStats.average} mmHg</span>
        </p>
    `;
    
    // 更新脉搏统计
    document.getElementById('pulseStats').innerHTML = `
        <p>
            <span class="label">最高值</span>
            <span class="value">${pulseStats.max} 次/分</span>
        </p>
        <p>
            <span class="label">最低值</span>
            <span class="value">${pulseStats.min} 次/分</span>
        </p>
        <p>
            <span class="label">平均值</span>
            <span class="value">${pulseStats.average} 次/分</span>
        </p>
    `;
    
    // 更新标准差统计
    document.getElementById('stdDevStats').innerHTML = `
        <p>
            <span class="label">高压标准差</span>
            <span class="value">${highPressureStdDev} mmHg</span>
        </p>
        <p>
            <span class="label">低压标准差</span>
            <span class="value">${lowPressureStdDev} mmHg</span>
        </p>
        <p>
            <span class="label">脉搏标准差</span>
            <span class="value">${pulseStdDev} 次/分</span>
        </p>
    `;
    
    // 更新昼夜差异统计
    document.getElementById('dayNightStats').innerHTML = `
        <p>
            <span class="label">日间高压</span>
            <span class="value">${dayNightDiff.dayHighAvg} mmHg</span>
        </p>
        <p>
            <span class="label">夜间高压</span>
            <span class="value">${dayNightDiff.nightHighAvg} mmHg</span>
        </p>
        <p>
            <span class="label">日间低压</span>
            <span class="value">${dayNightDiff.dayLowAvg} mmHg</span>
        </p>
        <p>
            <span class="label">夜间低压</span>
            <span class="value">${dayNightDiff.nightLowAvg} mmHg</span>
        </p>
        <p>
            <span class="label">高压昼夜差</span>
            <span class="value">${dayNightDiff.highDiff}%</span>
        </p>
        <p>
            <span class="label">低压昼夜差</span>
            <span class="value">${dayNightDiff.lowDiff}%</span>
        </p>
        <p>
            <span class="label">血压类型</span>
            <span class="value">${dayNightDiff.isDipper ? '杓型' : '非杓型'}</span>
        </p>
    `;
    
    // 更新血压分类统计
    document.getElementById('pressureCategoryStats').innerHTML = `
        <p>
            <span class="label">正常血压(<120/80)</span>
            <span class="value">${pressureCategories.normal.count} 次</span>
            <span class="percentage">(${((pressureCategories.normal.count / data.length) * 100).toFixed(1)}%)</span>
        </p>
        <p>
            <span class="label">正常高值(120-129/80-89)</span>
            <span class="value">${pressureCategories.elevated.count} 次</span>
            <span class="percentage">(${((pressureCategories.elevated.count / data.length) * 100).toFixed(1)}%)</span>
        </p>
        <p>
            <span class="label">轻度高血压(130-139/90-99)</span>
            <span class="value">${pressureCategories.stage1.count} 次</span>
            <span class="percentage">(${((pressureCategories.stage1.count / data.length) * 100).toFixed(1)}%)</span>
        </p>
        <p>
            <span class="label">中度高血压(140-159/100-109)</span>
            <span class="value">${pressureCategories.stage2.count} 次</span>
            <span class="percentage">(${((pressureCategories.stage2.count / data.length) * 100).toFixed(1)}%)</span>
        </p>
        <p>
            <span class="label">重度高血压(160/110)</span>
            <span class="value">${pressureCategories.stage3.count} 次</span>
            <span class="percentage">(${((pressureCategories.stage3.count / data.length) * 100).toFixed(1)}%)</span>
        </p>
    `;
    
    // 更新血压负荷统计
    document.getElementById('pressureLoadStats').innerHTML = `
        <p>
            <span class="label">总负荷率</span>
            <span class="value">${pressureLoad.totalLoad}%</span>
        </p>
        <p>
            <span class="label">高压负荷率</span>
            <span class="value">${pressureLoad.highLoad}%</span>
        </p>
        <p>
            <span class="label">低压负荷率</span>
            <span class="value">${pressureLoad.lowLoad}%</span>
        </p>
        <p>
            <span class="label">日间高压负荷</span>
            <span class="value">${pressureLoad.dayHighLoad}%</span>
        </p>
        <p>
            <span class="label">夜间高压负荷</span>
            <span class="value">${pressureLoad.nightHighLoad}%</span>
        </p>
        <p>
            <span class="label">日间低压负荷</span>
            <span class="value">${pressureLoad.dayLowLoad}%</span>
        </p>
        <p>
            <span class="label">夜间低压负荷</span>
            <span class="value">${pressureLoad.nightLowLoad}%</span>
        </p>
    `;
    
    // 创建昼夜差异图表
    createDayNightChart(dayNightDiff);
    
    // 创建血压分类饼图
    createPressureCategoryChart(pressureCategories);
    
    // 创建血压负荷图
    createPressureLoadChart(pressureLoad);
    
    // 创建标准差图表
    createStdDevChart(highPressureStdDev, lowPressureStdDev, pulseStdDev);
}

// 创建昼夜差异图表
function createDayNightChart(dayNightDiff) {
    const ctx = document.getElementById('dayNightChart').getContext('2d');
    
    // 检查并销毁现有图表
    if (window.dayNightChart instanceof Chart) {
        window.dayNightChart.destroy();
    }
    
    // 获取所有数据点
    const data = window.processedData;
    if (!data || data.length === 0) {
        console.error('No processed data available for day-night difference chart');
        return;
    }
    
    // 按日期分组数据
    const groupedData = new Map();
    data.forEach(entry => {
        const date = new Date(entry.date);
        const dateKey = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
        const hour = date.getHours();
        const isDay = hour >= 6 && hour < 18;
        
        if (!groupedData.has(dateKey)) {
            groupedData.set(dateKey, {
                date: dateKey,
                dayHigh: [],
                nightHigh: [],
                dayLow: [],
                nightLow: []
            });
        }
        
        const group = groupedData.get(dateKey);
        if (isDay) {
            group.dayHigh.push(entry.highPressure);
            group.dayLow.push(entry.lowPressure);
        } else {
            group.nightHigh.push(entry.highPressure);
            group.nightLow.push(entry.lowPressure);
        }
    });
    
    // 计算每日平均值和差异
    const chartData = Array.from(groupedData.values())
        .filter(group => {
            // 只保留同时有日间和夜间数据的日期
            return group.dayHigh.length > 0 && group.nightHigh.length > 0 &&
                   group.dayLow.length > 0 && group.nightLow.length > 0;
        })
        .map(group => {
            const dayHighAvg = group.dayHigh.reduce((a, b) => a + b, 0) / group.dayHigh.length;
            const nightHighAvg = group.nightHigh.reduce((a, b) => a + b, 0) / group.nightHigh.length;
            const dayLowAvg = group.dayLow.reduce((a, b) => a + b, 0) / group.dayLow.length;
            const nightLowAvg = group.nightLow.reduce((a, b) => a + b, 0) / group.nightLow.length;
            
            return {
                date: group.date,
                highDiff: dayHighAvg - nightHighAvg,
                lowDiff: dayLowAvg - nightLowAvg,
                dayHighAvg: dayHighAvg,
                nightHighAvg: nightHighAvg,
                dayLowAvg: dayLowAvg,
                nightLowAvg: nightLowAvg
            };
        });
    
    // 创建新图表
    window.dayNightChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.map(d => d.date),
            datasets: [
                {
                    label: '高压差异',
                    data: chartData.map(d => d.highDiff),
                    backgroundColor: 'rgba(255, 159, 64, 0.7)',
                    borderColor: 'rgb(255, 159, 64)',
                    borderWidth: 1
                },
                {
                    label: '低压差异',
                    data: chartData.map(d => d.lowDiff),
                    backgroundColor: 'rgba(75, 192, 192, 0.7)',
                    borderColor: 'rgb(75, 192, 192)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '昼夜血压差异分析',
                    font: {
                        size: 16
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            return `${context.dataset.label}: ${value.toFixed(1)} mmHg`;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        zeroLine: {
                            type: 'line',
                            yMin: 0,
                            yMax: 0,
                            borderColor: 'rgba(0, 0, 0, 0.3)',
                            borderWidth: 1,
                            borderDash: [5, 5]
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: false,
                        text: '日期'
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '血压差异 (mmHg)'
                    },
                    grid: {
                        display: true,
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        }
    });
}

// 创建血压分类饼图
function createPressureCategoryChart(categories) {
    const ctx = document.getElementById('pressureCategoryChart').getContext('2d');
    
    // 检查并销毁现有图表
    if (window.pressureCategoryChart instanceof Chart) {
        window.pressureCategoryChart.destroy();
    }
    
    // 创建新图表
    window.pressureCategoryChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.values(categories).map(cat => cat.label),
            datasets: [{
                data: Object.values(categories).map(cat => cat.count),
                backgroundColor: [
                    'rgb(129, 199, 132)',  // 正常血压 - 绿色
                    'rgb(255, 235, 59)',   // 正常高值 - 黄色
                    'rgb(255, 152, 0)',    // 轻度高血压 - 橙色
                    'rgb(255, 87, 34)',    // 中度高血压 - 深橙色
                    'rgb(244, 67, 54)'     // 重度高血压 - 红色
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '血压分类分布',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 20,
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value}次 (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// 创建血压负荷图
function createPressureLoadChart(loadData) {
    const ctx = document.getElementById('pressureLoadChart').getContext('2d');
    
    // 检查并销毁现有图表
    if (window.pressureLoadChart instanceof Chart) {
        window.pressureLoadChart.destroy();
    }
    
    // 创建新图表
    window.pressureLoadChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['总负荷率', '高压负荷率', '低压负荷率', '日间高压负荷', '夜间高压负荷', '日间低压负荷', '夜间低压负荷'],
            datasets: [{
                label: '负荷率 (%)',
                data: [
                    parseFloat(loadData.totalLoad),
                    parseFloat(loadData.highLoad),
                    parseFloat(loadData.lowLoad),
                    parseFloat(loadData.dayHighLoad),
                    parseFloat(loadData.nightHighLoad),
                    parseFloat(loadData.dayLowLoad),
                    parseFloat(loadData.nightLowLoad)
                ],
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(255, 159, 64, 0.7)',
                    'rgba(255, 205, 86, 0.7)',
                    'rgba(75, 192, 192, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(153, 102, 255, 0.7)',
                    'rgba(201, 203, 207, 0.7)'
                ],
                borderColor: [
                    'rgb(255, 99, 132)',
                    'rgb(255, 159, 64)',
                    'rgb(255, 205, 86)',
                    'rgb(75, 192, 192)',
                    'rgb(54, 162, 235)',
                    'rgb(153, 102, 255)',
                    'rgb(201, 203, 207)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '血压负荷分析',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.raw}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: '负荷率 (%)'
                    }
                }
            }
        }
    });
}

// 日期时间格式化函数
function formatDateTime(date, format = 'full') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    switch (format) {
        case 'full':
            return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
        case 'date':
            return `${year}/${month}/${day}`;
        case 'time':
            return `${hours}:${minutes}`;
        case 'compact':
            return `${month}/${day} ${hours}:${minutes}`;
        case 'short':
            return `${month}-${day} ${hours}:${minutes}`;
        default:
            return `${year}/${month}/${day} ${hours}:${minutes}`;
    }
}

// 智能日期时间格式化
function smartFormatDateTime(date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (dateOnly.getTime() === today.getTime()) {
        return `今天 ${formatDateTime(date, 'time')}`;
    } else if (dateOnly.getTime() === yesterday.getTime()) {
        return `昨天 ${formatDateTime(date, 'time')}`;
    } else if (date.getFullYear() === now.getFullYear()) {
        return formatDateTime(date, 'compact');
    } else {
        return formatDateTime(date, 'short');
    }
}

// 更新数据表格
function updateTable(data) {
    const table = document.getElementById('dataTable').parentElement;
    const tbody = document.getElementById('dataTable');
    
    // 清空表格内容
    table.innerHTML = '';
    
    // 创建表头
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th style="min-width: 180px;" class="date-column">测量时间</th>
            <th style="min-width: 100px;">高压 (mmHg)</th>
            <th style="min-width: 100px;">低压 (mmHg)</th>
            <th style="min-width: 100px;">脉搏 (次/分)</th>
        </tr>
    `;
    
    // 重新创建tbody
    const newTbody = document.createElement('tbody');
    newTbody.id = 'dataTable';
    
    // 添加表头和数据行
    table.appendChild(thead);
    table.appendChild(newTbody);
    
    // 添加数据行
    data.forEach(entry => {
        const row = document.createElement('tr');
        const highPressureClass = entry.highPressure > pressureSettings.highPressureMax ? 'abnormal-high' : '';
        const lowPressureClass = entry.lowPressure > pressureSettings.lowPressureMax ? 'abnormal-low' : '';
        
        // 格式化时间显示
        const date = new Date(entry.date);
        const fullDateTime = formatDateTime(date, 'full');
        const smartDateTime = smartFormatDateTime(date);
        
        row.innerHTML = `
            <td class="date-cell" title="${fullDateTime}">${smartDateTime}</td>
            <td class="${highPressureClass}" title="${entry.highPressure} mmHg">${entry.highPressure}</td>
            <td class="${lowPressureClass}" title="${entry.lowPressure} mmHg">${entry.lowPressure}</td>
            <td title="${entry.pulse} 次/分">${entry.pulse}</td>
        `;
        newTbody.appendChild(row);
    });
    
    // 添加表格排序功能
    const headers = thead.getElementsByTagName('th');
    for (let i = 0; i < headers.length; i++) {
        headers[i].addEventListener('click', function() {
            sortTable(i);
        });
        headers[i].style.cursor = 'pointer';
        headers[i].title = '点击排序';
    }
}

// 表格排序函数
function sortTable(columnIndex) {
    const table = document.getElementById('dataTable').parentElement;
    const tbody = document.getElementById('dataTable');
    const rows = Array.from(tbody.getElementsByTagName('tr'));
    const header = table.getElementsByTagName('th')[columnIndex];
    
    // 切换排序方向
    const isAscending = header.classList.contains('asc') ? false : true;
    
    // 移除所有表头的排序标记
    Array.from(table.getElementsByTagName('th')).forEach(th => {
        th.classList.remove('asc', 'desc');
    });
    
    // 添加当前排序方向标记
    header.classList.add(isAscending ? 'asc' : 'desc');
    
    // 排序行
    rows.sort((a, b) => {
        const aValue = a.cells[columnIndex].textContent.trim();
        const bValue = b.cells[columnIndex].textContent.trim();
        
        if (columnIndex === 0) {
            // 日期列特殊处理
            return isAscending ? 
                new Date(aValue) - new Date(bValue) : 
                new Date(bValue) - new Date(aValue);
        } else {
            // 数值列处理
            const aNum = parseInt(aValue);
            const bNum = parseInt(bValue);
            return isAscending ? aNum - bNum : bNum - aNum;
        }
    });
    
    // 重新插入排序后的行
    rows.forEach(row => tbody.appendChild(row));
}

// 创建图表
function createChart(data) {
    const bloodPressureCtx = document.getElementById('bloodPressureChart').getContext('2d');
    const pulseCtx = document.getElementById('pulseChart').getContext('2d');
    
    // 如果已存在图表，先销毁
    if (bloodPressureChart) {
        bloodPressureChart.destroy();
    }
    if (pulseChart) {
        pulseChart.destroy();
    }
    
    // 计算Y轴范围
    const highPressureValues = data.map(entry => entry.highPressure);
    const lowPressureValues = data.map(entry => entry.lowPressure);
    const pulseValues = data.map(entry => entry.pulse);
    
    const highPressureMin = Math.min(...highPressureValues);
    const highPressureMax = Math.max(...highPressureValues);
    const lowPressureMin = Math.min(...lowPressureValues);
    const lowPressureMax = Math.max(...lowPressureValues);
    const pulseMin = Math.min(...pulseValues);
    const pulseMax = Math.max(...pulseValues);
    
    // 计算平均值
    const highPressureAvg = Math.round(highPressureValues.reduce((a, b) => a + b, 0) / highPressureValues.length);
    const lowPressureAvg = Math.round(lowPressureValues.reduce((a, b) => a + b, 0) / lowPressureValues.length);
    const pulseAvg = Math.round(pulseValues.reduce((a, b) => a + b, 0) / pulseValues.length);
    
    // 设置Y轴范围，留出10%的边距
    const highPressureRange = {
        min: Math.floor(highPressureMin * 0.9),
        max: Math.ceil(highPressureMax * 1.1)
    };
    
    const lowPressureRange = {
        min: Math.floor(lowPressureMin * 0.9),
        max: Math.ceil(lowPressureMax * 1.1)
    };
    
    const pulseRange = {
        min: Math.floor(pulseMin * 0.9),
        max: Math.ceil(pulseMax * 1.1)
    };

    // 创建血压图表
    bloodPressureChart = new Chart(bloodPressureCtx, {
        id: 'bloodPressureChart',
        type: 'line',
        data: {
            labels: data.map(entry => {
                const date = new Date(entry.date);
                return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            }),
            datasets: [
                {
                    label: '高压',
                    data: data.map(entry => entry.highPressure),
                    borderColor: colorConfig.highPressure.main,
                    backgroundColor: colorConfig.highPressure.bg,
                    borderWidth: 2,
                    pointRadius: window.pointRadius || 3,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.highPressure.main,
                    pointBorderColor: colorConfig.highPressure.main,
                    pointHoverRadius: window.pointHoverRadius || 3.6,
                    pointHoverBackgroundColor: colorConfig.highPressure.main,
                    pointHoverBorderColor: colorConfig.highPressure.main,
                    tension: 0.1
                },
                {
                    label: '高压平均值',
                    data: Array(data.length).fill(highPressureAvg),
                    borderColor: colorConfig.highPressure.avg,
                    backgroundColor: colorConfig.highPressure.bg,
                    borderWidth: 1,
                    pointRadius: 0,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.highPressure.avg,
                    pointBorderColor: colorConfig.highPressure.avg,
                    pointHoverRadius: 0,
                    pointHoverBackgroundColor: colorConfig.highPressure.bg,
                    pointHoverBorderColor: colorConfig.highPressure.avg,
                    tension: 0.1
                },
                {
                    label: '低压',
                    data: data.map(entry => entry.lowPressure),
                    borderColor: colorConfig.lowPressure.main,
                    backgroundColor: colorConfig.lowPressure.bg,
                    borderWidth: 2,
                    pointRadius: window.pointRadius || 3,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.lowPressure.main,
                    pointBorderColor: colorConfig.lowPressure.main,
                    pointHoverRadius: window.pointHoverRadius || 3.6,
                    pointHoverBackgroundColor: colorConfig.lowPressure.main,
                    pointHoverBorderColor: colorConfig.lowPressure.main,
                    tension: 0.1
                },
                {
                    label: '低压平均值',
                    data: Array(data.length).fill(lowPressureAvg),
                    borderColor: colorConfig.lowPressure.avg,
                    backgroundColor: colorConfig.lowPressure.bg,
                    borderWidth: 1,
                    pointRadius: 0,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.lowPressure.avg,
                    pointBorderColor: colorConfig.lowPressure.avg,
                    pointHoverRadius: 0,
                    pointHoverBackgroundColor: colorConfig.lowPressure.bg,
                    pointHoverBorderColor: colorConfig.lowPressure.avg,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            
            scales: {
                y: {
                    beginAtZero: false,
                    min: Math.floor(lowPressureRange.min),
                    max: Math.ceil(highPressureRange.max),
                    title: {
                        display: true,
                        text: '血压 (mmHg)'
                    },
                    grid: {
                        display: true,
                        color: colorConfig.common.grid,
                        drawBorder: true,
                        drawOnChartArea: true,
                        drawTicks: true
                    },
                    position: 'left'
                },
                y1: {
                    beginAtZero: false,
                    min: Math.floor(lowPressureRange.min),
                    max: Math.ceil(highPressureRange.max),
                    position: 'right',
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: false
                    },
                    afterFit: function(scale) {
                        scale.paddingRight = 80; // 为右侧标注留出空间
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: true,
                        drawOnChartArea: false,
                        drawTicks: true
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'center',
                    onClick: function(e, legendItem, legend) {
                        const index = legendItem.index;
                        const chart = legend.chart;
                        const dataset = chart.data.datasets[index];
                        
                        // 切换数据集的显示状态
                        dataset.hidden = !dataset.hidden;
                        
                        // 更新图表
                        chart.update();
                    },
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                        pointStyleWidth: 40,
                        pointStyleHeight: 1,
                        boxWidth: 40,
                        boxHeight: 1,
                        padding: 20,
                        color: colorConfig.common.text,
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const datasets = chart.data.datasets;
                            return datasets.map((dataset, i) => ({
                                text: dataset.label,
                                fillStyle: 'transparent',
                                strokeStyle: dataset.borderColor,
                                lineWidth: dataset.borderWidth,
                                lineDash: dataset.borderDash || [],
                                hidden: dataset.hidden,
                                index: i,
                                boxWidth: 40,
                                boxHeight: 1,
                                pointStyle: 'line',
                                pointStyleWidth: 40,
                                pointStyleHeight: 1,
                                draw: function(ctx, item, x, y, w, h) {
                                    const width = 40;
                                    const height = 1;
                                    const xPos = x + (w - width) / 2;
                                    const yPos = y + (h - height) / 2;
                                    
                                    ctx.save();
                                    ctx.strokeStyle = item.strokeStyle;
                                    ctx.lineWidth = item.lineWidth;
                                    ctx.beginPath();
                                    ctx.moveTo(xPos, yPos);
                                    ctx.lineTo(xPos + width, yPos);
                                    ctx.stroke();
                                    ctx.restore();
                                }
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const date = new Date(data[context[0].dataIndex].date);
                            return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y + ' mmHg';
                            }
                            return label;
                        },
                        labelColor: function(context) {
                            return {
                                borderColor: context.dataset.borderColor,
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                borderDash: [],
                                width: 40,
                                height: 1
                            };
                        }
                    },
                    displayColors: true,
                    usePointStyle: false,
                    boxWidth: 20,
                    boxHeight: 1,
                    boxPadding: 0
                },
                annotation: {
                    common: {
                        drawTime: 'afterDatasetsDraw'
                    },
                    annotations: {
                        highPressure: {
                            type: 'line',
                            yMin: pressureSettings.highPressure,
                            yMax: pressureSettings.highPressure,
                            borderColor: colorConfig.highPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `高压上限 ${pressureSettings.highPressure}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.highPressure.limitBg,
                                color: colorConfig.highPressure.limit
                            }
                        },
                        lowPressure: {
                            type: 'line',
                            yMin: pressureSettings.lowPressure,
                            yMax: pressureSettings.lowPressure,
                            borderColor: colorConfig.lowPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `低压上限 ${pressureSettings.lowPressure}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.lowPressure.limitBg,
                                color: colorConfig.lowPressure.limit
                            }
                        }
                    }
                }
            }
        }
    });

    // 创建脉搏图表
    pulseChart = new Chart(pulseCtx, {
        id: 'pulseChart',
        type: 'line',
        data: {
            labels: data.map(entry => {
                const date = new Date(entry.date);
                return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            }),
            datasets: [
                {
                    label: '脉搏',
                    data: data.map(entry => entry.pulse),
                    borderColor: colorConfig.pulse.main,
                    backgroundColor: colorConfig.pulse.bg,
                    borderWidth: 2,
                    pointRadius: window.pointRadius || 3,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.pulse.main,
                    pointBorderColor: colorConfig.pulse.main,
                    pointHoverRadius: window.pointHoverRadius || 3.6,
                    pointHoverBackgroundColor: colorConfig.pulse.main,
                    pointHoverBorderColor: colorConfig.pulse.main,
                    tension: 0.1
                },
                {
                    label: '脉搏平均值',
                    data: Array(data.length).fill(pulseAvg),
                    borderColor: colorConfig.pulse.avg,
                    backgroundColor: colorConfig.pulse.bg,
                    borderWidth: 1,
                    pointRadius: 0,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.pulse.avg,
                    pointBorderColor: colorConfig.pulse.avg,
                    pointHoverRadius: 0,
                    pointHoverBackgroundColor: colorConfig.pulse.bg,
                    pointHoverBorderColor: colorConfig.pulse.avg,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: Math.floor(pulseRange.min),
                    max: Math.ceil(pulseRange.max),
                    title: {
                        display: true,
                        text: '脉搏 (次/分)'
                    },
                    grid: {
                        display: true,
                        color: colorConfig.common.grid,
                        drawBorder: true,
                        drawOnChartArea: true,
                        drawTicks: true
                    },
                    position: 'left'
                },
                y1: {
                    beginAtZero: false,
                    min: Math.floor(pulseRange.min),
                    max: Math.ceil(pulseRange.max),
                    position: 'right',
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: false
                    },
                    afterFit: function(scale) {
                        scale.paddingRight = 80; // 为右侧标注留出空间
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: true,
                        drawOnChartArea: false,
                        drawTicks: true
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'center',
                    onClick: function(e, legendItem, legend) {
                        const index = legendItem.index;
                        const chart = legend.chart;
                        const dataset = chart.data.datasets[index];
                        
                        // 切换数据集的显示状态
                        dataset.hidden = !dataset.hidden;
                        
                        // 更新图表
                        chart.update();
                    },
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                        pointStyleWidth: 40,
                        pointStyleHeight: 1,
                        boxWidth: 40,
                        boxHeight: 1,
                        padding: 20,
                        color: colorConfig.common.text,
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const datasets = chart.data.datasets;
                            return datasets.map((dataset, i) => ({
                                text: dataset.label,
                                fillStyle: 'transparent',
                                strokeStyle: dataset.borderColor,
                                lineWidth: dataset.borderWidth,
                                lineDash: dataset.borderDash || [],
                                hidden: dataset.hidden,
                                index: i,
                                boxWidth: 40,
                                boxHeight: 1,
                                pointStyle: 'line',
                                pointStyleWidth: 40,
                                pointStyleHeight: 1,
                                draw: function(ctx, item, x, y, w, h) {
                                    const width = 40;
                                    const height = 1;
                                    const xPos = x + (w - width) / 2;
                                    const yPos = y + (h - height) / 2;
                                    
                                    ctx.save();
                                    ctx.strokeStyle = item.strokeStyle;
                                    ctx.lineWidth = item.lineWidth;
                                    ctx.beginPath();
                                    ctx.moveTo(xPos, yPos);
                                    ctx.lineTo(xPos + width, yPos);
                                    ctx.stroke();
                                    ctx.restore();
                                }
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const date = new Date(data[context[0].dataIndex].date);
                            return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y + ' mmHg';
                            }
                            return label;
                        },
                        labelColor: function(context) {
                            return {
                                borderColor: context.dataset.borderColor,
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                borderDash: [],
                                width: 40,
                                height: 1
                            };
                        }
                    },
                    displayColors: true,
                    usePointStyle: false,
                    boxWidth: 20,
                    boxHeight: 1,
                    boxPadding: 0
                },
                annotation: {
                    common: {
                        drawTime: 'afterDatasetsDraw'
                    },
                    annotations: {
                        pulseAvg: {
                            type: 'line',
                            yMin: pulseAvg,
                            yMax: pulseAvg,
                            borderColor: colorConfig.pulse.avg,
                            borderWidth: 2,
                            borderDash: [],
                            yScaleID: 'y1',
                            label: {
                                content: `脉搏平均值 ${pulseAvg}次/分`,
                                enabled: true,
                                position: 'right',
                                backgroundColor: colorConfig.pulse.bg,
                                color: colorConfig.pulse.avg,
                                xAdjust: 5,
                                yAdjust: 0,
                                padding: 4,
                                font: {
                                    size: 12
                                }
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
    pressureSettings.highPressure = parseInt(document.getElementById('highPressure').value);
    pressureSettings.lowPressure = parseInt(document.getElementById('lowPressure').value);
    
    // 重新加载数据并更新显示
    const fileInput = document.getElementById('csvFile');
    if (fileInput.files.length > 0) {
        loadDataFromFile(fileInput.files[0]).then(rawData => {
            if (rawData.length > 0) {
                const { originalCount, processedData } = preprocessData(rawData);
                updateStats(processedData, originalCount);
                updateTable(processedData);
                createChart(processedData);
            }
        });
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init); 

window.pointRadius = 2.8;  // 设置数据点大小为4
window.pointHoverRadius = 3.6;  // 设置悬停时数据点大小为5
bloodPressureChart.update();  // 更新图表
pulseChart.update();  // 更新图表 

// 更新图表
function updateCharts() {
    if (window.processedData) {
        createChart(window.processedData);
    }
}

// 创建标准差分析图表
function createStdDevChart(highPressureStdDev, lowPressureStdDev, pulseStdDev) {
    const ctx = document.getElementById('stdDevChart').getContext('2d');
    
    if (window.stdDevChart instanceof Chart) {
        window.stdDevChart.destroy();
    }
    
    const labels = ['高压标准差', '低压标准差', '脉搏标准差'];
    const data = [
        parseFloat(highPressureStdDev),
        parseFloat(lowPressureStdDev),
        parseFloat(pulseStdDev)
    ];
    
    window.stdDevChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '标准差',
                data: data,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.7)',
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(75, 192, 192, 0.7)'
                ],
                borderColor: [
                    'rgb(255, 99, 132)',
                    'rgb(54, 162, 235)',
                    'rgb(75, 192, 192)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '血压和脉搏标准差分析',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw.toFixed(1)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '标准差'
                    }
                },
                x: {
                    title: {
                        display: false,
                        text: '测量指标'
                    }
                }
            }
        }
    });
}

// 生成血压建议函数
function generateBloodPressureRecommendations(
    highPressureStats,
    lowPressureStats,
    pulseStats,
    abnormalStats,
    dayNightDiff,
    pressureCategories,
    pressureLoad,
    highPressureStdDev,
    lowPressureStdDev
) {
    //console.log('血压建议生成 - 输入数据:', {
    //    highPressureStats,
    //    lowPressureStats,
    //    pulseStats,
    //    abnormalStats,
    //    dayNightDiff,
    //    pressureCategories,
    //    pressureLoad,
    //    highPressureStdDev,
    //    lowPressureStdDev
    //});

    const recommendations = [];

    // 1. 血压水平评估
    const avgHighPressure = parseFloat(highPressureStats.average);
    const avgLowPressure = parseFloat(lowPressureStats.average);
    
    if (avgHighPressure < 120 && avgLowPressure < 80) {
        recommendations.push("您的血压处于正常水平，请继续保持健康的生活方式。");
    } else if (avgHighPressure >= 120 && avgHighPressure <= 129 && avgLowPressure < 80) {
        recommendations.push("您的血压处于正常高值，建议：1) 控制饮食，减少盐分摄入；2) 增加运动量；3) 保持健康体重；4) 定期监测血压。");
    } else if (avgHighPressure < 120 && avgLowPressure >= 80 && avgLowPressure <= 89) {
        recommendations.push("您的低压偏高，建议：1) 控制饮食，减少盐分摄入；2) 增加运动量；3) 保持健康体重；4) 定期监测血压。");
    } else if ((avgHighPressure >= 130 && avgHighPressure <= 139) || (avgLowPressure >= 80 && avgLowPressure <= 89)) {
        recommendations.push("您处于轻度高血压状态，建议：1) 立即就医咨询；2) 遵医嘱服用降压药物；3) 严格控制饮食和运动；4) 每日监测血压。");
    } else if ((avgHighPressure >= 140 && avgHighPressure <= 159) || (avgLowPressure >= 90 && avgLowPressure <= 99)) {
        recommendations.push("您处于中度高血压状态，建议：1) 立即就医；2) 严格遵医嘱服药；3) 改变生活方式；4) 密切监测血压变化。");
    } else {
        recommendations.push("您处于重度高血压状态，建议：1) 立即就医；2) 可能需要住院治疗；3) 严格遵医嘱服药；4) 每日多次监测血压。");
    }

    // 2. 血压波动分析
    if (parseFloat(highPressureStdDev) > 15 || parseFloat(lowPressureStdDev) > 10) {
        recommendations.push("您的血压波动较大，建议：1) 保持规律作息；2) 避免情绪激动；3) 控制饮食规律；4) 增加测量频率。");
    }

    // 3. 昼夜节律分析
    if (!dayNightDiff.isDipper) {
        recommendations.push("您的血压昼夜节律异常（非杓型），建议：1) 改善睡眠质量；2) 避免熬夜；3) 控制夜间活动；4) 咨询医生是否需要调整用药时间。");
    }

    // 4. 血压负荷分析
    if (parseFloat(pressureLoad.highLoad) > 25 || parseFloat(pressureLoad.lowLoad) > 25) {
        recommendations.push("您的血压负荷较高，建议：1) 增加降压药物剂量或种类；2) 加强生活方式干预；3) 定期复查；4) 避免剧烈运动。");
    }

    // 5. 脉搏分析
    const avgPulse = parseFloat(pulseStats.average);
    if (avgPulse > 100) {
        recommendations.push("您的心率偏快，建议：1) 控制情绪；2) 避免剧烈运动；3) 咨询医生是否需要使用控制心率的药物。");
    } else if (avgPulse < 60) {
        recommendations.push("您的心率偏慢，建议：1) 适当增加运动量；2) 咨询医生是否需要调整降压药物。");
    }

    return recommendations;
}

// 导出PDF报告
async function exportToPdf() {
    // 检查是否有数据
    if (!document.querySelector('.stats-container').style.display || 
        document.querySelector('.stats-container').style.display === 'none') {
        alert('请先选择并加载血压数据文件');
        return;
    }

    // 显示加载提示
    const fileInfo = document.getElementById('fileInfo');
    const originalContent = fileInfo.innerHTML;
    fileInfo.innerHTML = '正在生成PDF报告，请稍候...';

    try {
        // 创建PDF文档
        const pdf = new jspdf.jsPDF({
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
        });

        // 设置页面边距
        const margin = 10;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const contentWidth = pageWidth - (margin * 2);

        // 添加标题
        pdf.setFontSize(20);
        pdf.setTextColor(51, 51, 51);
        const title = '血压分析报告';
        const titleWidth = pdf.getTextWidth(title);
        pdf.text(title, (pageWidth - titleWidth) / 2, margin + 10);

        // 添加生成时间
        pdf.setFontSize(12);
        pdf.setTextColor(102, 102, 102);
        const time = `生成时间：${new Date().toLocaleString()}`;
        const timeWidth = pdf.getTextWidth(time);
        pdf.text(time, pageWidth - margin - timeWidth, margin + 20);

        let yOffset = margin + 30;

        // 处理统计信息
        const statsContainer = document.querySelector('.stats-container');
        const statsCanvas = await html2canvas(statsContainer, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff'
        });
        const statsImgData = statsCanvas.toDataURL('image/jpeg', 1.0);
        const statsImgProps = pdf.getImageProperties(statsImgData);
        const statsImgWidth = contentWidth;
        const statsImgHeight = (statsImgProps.height * statsImgWidth) / statsImgProps.width;
        pdf.addImage(statsImgData, 'JPEG', margin, yOffset, statsImgWidth, statsImgHeight);
        yOffset += statsImgHeight + 10;

        // 处理建议
        const recommendations = document.querySelector('.recommendations-container');
        const recommendationsCanvas = await html2canvas(recommendations, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff'
        });
        const recommendationsImgData = recommendationsCanvas.toDataURL('image/jpeg', 1.0);
        const recommendationsImgProps = pdf.getImageProperties(recommendationsImgData);
        const recommendationsImgWidth = contentWidth;
        const recommendationsImgHeight = (recommendationsImgProps.height * recommendationsImgWidth) / recommendationsImgProps.width;
        pdf.addImage(recommendationsImgData, 'JPEG', margin, yOffset, recommendationsImgWidth, recommendationsImgHeight);
        yOffset += recommendationsImgHeight + 10;

        // 处理图表
        const charts = document.querySelectorAll('.chart-container');
        for (const chartContainer of charts) {
            // 检查是否需要新页面
            if (yOffset > pageHeight - margin) {
                pdf.addPage();
                yOffset = margin;
            }

            const chartCanvas = await html2canvas(chartContainer, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff'
            });
            const chartImgData = chartCanvas.toDataURL('image/jpeg', 1.0);
            const chartImgProps = pdf.getImageProperties(chartImgData);
            const chartImgWidth = contentWidth;
            const chartImgHeight = (chartImgProps.height * chartImgWidth) / chartImgProps.width;

            // 如果图表高度超过页面剩余空间，添加新页面
            if (yOffset + chartImgHeight > pageHeight - margin) {
                pdf.addPage();
                yOffset = margin;
            }

            pdf.addImage(chartImgData, 'JPEG', margin, yOffset, chartImgWidth, chartImgHeight);
            yOffset += chartImgHeight + 10;
        }

        // 处理表格
        const table = document.querySelector('.table-container');
        const tableCanvas = await html2canvas(table, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff'
        });
        const tableImgData = tableCanvas.toDataURL('image/jpeg', 1.0);
        const tableImgProps = pdf.getImageProperties(tableImgData);
        const tableImgWidth = contentWidth;
        const tableImgHeight = (tableImgProps.height * tableImgWidth) / tableImgProps.width;

        // 如果表格高度超过页面剩余空间，添加新页面
        if (yOffset + tableImgHeight > pageHeight - margin) {
            pdf.addPage();
            yOffset = margin;
        }

        pdf.addImage(tableImgData, 'JPEG', margin, yOffset, tableImgWidth, tableImgHeight);

        // 保存PDF
        pdf.save('血压分析报告.pdf');
        
        fileInfo.innerHTML = 'PDF报告生成成功！';
        setTimeout(() => {
            fileInfo.innerHTML = originalContent;
        }, 3000);
    } catch (error) {
        console.error('生成PDF报告失败:', error);
        fileInfo.innerHTML = '生成PDF报告失败，请重试';
        setTimeout(() => {
            fileInfo.innerHTML = originalContent;
        }, 3000);
    }
} 