import { DataTypes } from "sequelize";
import sequelize from "../database/db.js";

const Bid = sequelize.define(
  "Bid",
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    bidName: { type: DataTypes.STRING },
    bidCloseDate: { type: DataTypes.DATE },
    year: { type: DataTypes.INTEGER },
    isClosed: { type: DataTypes.BOOLEAN },
    hasWinner: { type: DataTypes.BOOLEAN },
    investorName: { type: DataTypes.STRING },
    bidPrice: { type: DataTypes.FLOAT },
    fieldCategory: { type: DataTypes.STRING },
    vendorName: { type: DataTypes.STRING, allowNull: true },
  },
  {
    tableName: "Bids",
    timestamps: false,
  }
);

export default Bid;
