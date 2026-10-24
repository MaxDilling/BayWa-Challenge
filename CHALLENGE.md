# BayWa r.e. detailed Challenge

## **1. Background & Problem**

The communication connection to a wind farm is monitored. If the connection fails, the wind farm may have lost power and stopped operating.

Possible causes include cable damage between the wind farm and the grid connection station or technical faults preventing electricity from being fed into the grid.

Accurately estimating the resulting energy yield losses is important, particularly for **business interruption insurance claims**.

Normally, energy losses can be calculated using wind speeds measured at the turbine's nacelle and the turbine's power curve. However, during a complete outage, these wind measurements are missing.

**Current approach:** Wind data from a neighboring wind farm is used to estimate the missing wind speeds and calculate energy yield losses.

**Challenge objective:** Develop a tool that automates this process.

## **2. How the Tool Should Work**

**User inputs:**

- **Wind data:** Time series from the reference and affected wind farms (CSV upload).
- **Power curves:** Power curves for target turbines.
- **Outage period:** Automatically detected from missing data, with manual adjustment possible.

**Process:**

1. **Analyze:** Learn the relationship between wind speeds at both wind farms using historical data before the outage.
2. **Predict:** Apply this relationship to reference wind data during the outage to estimate missing wind speeds.
3. **Calculate:** Use the predicted wind speeds and power curve to calculate the energy yield loss (kWh).

## **3. Data Provided**

All wind data consists of **10-minute average wind speeds measured at hub height**.

**Training Data**

- Historical wind speeds from both wind farms covering the same period of up to 30 days.
- Teams should split the data chronologically, for example reserving the final days for validation.

**Test Data (Hidden)**

- An outage is simulated by removing actual measurements from the affected wind farm.
- Missing values are marked as **NaN**.
- Teams predict the missing values using reference wind farm data.
- Predictions are compared against actual measurements.
- The test period is not disclosed in advance.

## **4. Required Deliverables**

1. **GUI:** A user-friendly interface running locally in a standard web browser, containing:
    1. **Accuracy Metrics** of your choice
    2. **Wind Speed Visualization:** Display the predicted wind speed time series.
    3. **Prediction Method:** Explain the method and its accuracy/uncertainty (e.g., correlation analysis).
    4. **Energy Loss Calculation:** Calculate the energy yield loss in kWh.
    5. **Energy Loss Visualization:** Visualize the calculated losses.
2. Accuracy on test dataset (see Assessment criteria)
    1. Wind speed (RMSE, MAE)
    2. Power (RMSE, MAE)
    3. Deviation of summed energy yield

**Assessment criteria**

- 40% model accuracy (using defined metrics)
- 10% presentation
- 30% User experience
- 20% Solution concept

**Important:** The workflow and methodology must be easy to explain. If there is a trade-off between prediction accuracy and explainability, **prioritize explainability**.

1. **Bonus Challenges**

If time permits:

1. **Insurance Report:** Generate an email summarizing the outage for the insurance company.
2. **Additional Parameters:** Include temperature, air pressure, or other parameters to improve prediction accuracy.
3. **Automatic Turbine Selection: Tool chooses input automatically from pool of available turbines.**
    
    ---
    

**Technical Specifications**

**File format:** CSV

**Columns:** Timestamp (Berlin/Germany time zone) | Wind speed (m/s)

**Measurement interval:** 10-minute averages at hub height

**🏆 What You Can Win**

**€1,000 in prize money for the winning team.**
## **5. Dataset README** (from `data/data_hackathon_baywa_re/README.docx`)

The dataset supports estimating a wind turbine's energy yield loss during missing measurements from reference turbines in other wind parks. Teams may use individual reference turbines, several turbines or park-level aggregates, as long as the reference data comes from **outside the target wind park**. The choice of reference turbines and parks is up to the teams.

**Structure:** 90 days of 10-minute time series from 10 turbines in three wind parks, plus the power curves of the target turbines. Turbine names are a capital letter (the park) and a number (the turbine), e.g. T1, O2, H3. **Target turbines** start with T; **reference turbines** are all turbines outside the target park.

**Time series** (one file per turbine, e.g. `T1_data.xlsx`):

- `turbine_name`: turbine identifier, constant within a file
- `timestamp`: date and time of the measurement
- `wind_speed`: average wind at hub height (the primary parameter)
- `wind_direction`: may help identify directional effects and differences in exposure between parks
- `ambient_temperature`
- `air_pressure`: may add information on atmospheric conditions and air density
- `wind_speed_stddev`: variability within the interval, may characterize turbulence
- `test_set`: marks the designated test period

Additional parameters are optional. Air pressure and wind speed standard deviation are unavailable for park O (O1, O2); there, air pressure is a constant estimate of the average pressure at hub height, not a measurement.

**Power curves:** one file per target turbine, `<turbine>_power_curve.xlsx` (e.g. `T1_power_curve.xlsx`), relating wind speed to expected power; to be combined with the predicted wind to estimate the energy yield loss.

**Training and test data:** the 90 days contain a test period, divided into

- **shown test data**, 4–9 September inclusive: measurements available, for conventional performance evaluation;
- **hidden test data**, 1–3 September inclusive: measurements of the target turbines withheld to simulate an outage and represented by NaN. The judges compare the submitted predictions with the withheld measurements.

**Missing data:** random gaps in all datasets; communication gaps of several hours in July in some training datasets (real communication issues, to be treated as unavailable); the hidden test measurements. All missing values are NaN and must not be read as zero wind or zero power.
