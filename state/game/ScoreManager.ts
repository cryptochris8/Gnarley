// Score tracking and management

export interface ScoreState {
  red: number;
  blue: number;
}

export class ScoreManager {
  private score: ScoreState;

  constructor() {
    this.score = {
      red: 0,
      blue: 0
    };
    console.log("ScoreManager initialized");
  }

  /**
   * Increment score for a team
   * @param team - Team to score for
   */
  addGoal(team: "red" | "blue"): void {
    this.score[team]++;
    console.log(`⚽ Goal scored! New score: Red ${this.score.red} - Blue ${this.score.blue}`);
  }

  /**
   * Get current score
   * @returns Current score state
   */
  getScore(): ScoreState {
    return { ...this.score };
  }

  /**
   * Get score for specific team
   * @param team - Team to get score for
   * @returns Team's score
   */
  getTeamScore(team: "red" | "blue"): number {
    return this.score[team];
  }

  /**
   * Check if game is tied
   * @returns True if scores are equal
   */
  isTied(): boolean {
    return this.score.red === this.score.blue;
  }

  /**
   * Get winning team
   * @returns Winning team or null if tied
   */
  getWinningTeam(): "red" | "blue" | null {
    if (this.score.red > this.score.blue) {
      return "red";
    } else if (this.score.blue > this.score.red) {
      return "blue";
    }
    return null;
  }

  /**
   * Reset scores to 0-0
   */
  reset(): void {
    this.score.red = 0;
    this.score.blue = 0;
    console.log("Scores reset to 0-0");
  }
}
